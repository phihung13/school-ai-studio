// ── Đổi mã uỷ quyền nhận qua postMessage (luồng nhúng iframe của Hub) ───────────────────────────
// Khác Đường A ở ĐÚNG HAI CHỖ:
//  1. `code` không về theo địa chỉ quay về của Factory mà do Hub chuyển sang bằng postMessage, nên
//     redirect_uri lúc đổi mã là địa chỉ relay CỦA HUB.
//  2. Phản hồi uỷ quyền không đi qua URL nên phải tự đắp `iss` (RFC 9207) — thiếu nó openid-client
//     tự chặn với "invalid response encountered" và không hề gọi mạng.
// Mọi thứ còn lại — PKCE, kiểm chữ ký id_token theo JWKS, nối định danh — dùng lại nguyên Đường A.
//
// code_verifier do chính trang /embed sinh và giữ trong bộ nhớ trang, chưa từng rời trình duyệt;
// nó đi thẳng từ trang lên máy chủ Factory ở request này, không qua Hub. Hub chỉ thấy code_challenge.
import { NextRequest, NextResponse } from "next/server";
import * as client from "openid-client";
import { getDB, logActivity, persist } from "@/lib/store";
import { makeToken, SESSION_COOKIE } from "@/lib/auth";
import { checkAudience, discover, providerById, sessionMinutes } from "@/lib/oidc";
import { linkIdentity } from "@/lib/identity-link";

export const dynamic = "force-dynamic";

const HUB_RELAY = process.env.HUB_EMBED_RELAY || "https://hub.truongvietanh.com/embed/relay";

type KetQua =
  | { ok: true; userId: string; name: string; role: string; sid?: string; mins: number }
  | { ok: false; status: number; error: string; hubError?: string };

// Một mã uỷ quyền chỉ đổi được MỘT lần. Nếu vì lý do gì đó trang gửi lên hai lần (hai message tới
// sát nhau, người dùng bấm lại, React chạy effect hai lượt…), lần thứ hai sẽ ăn invalid_grant và
// người dùng thấy lỗi dù lần đầu đã thành công. Nhớ lại theo mã: cùng mã thì dùng chung KẾT QUẢ của
// lượt đầu, không gọi Hub lần nữa. Đây là chốt chặn thật — cờ ở phía trình duyệt chỉ là lớp ngoài.
const dangXuLy = new Map<string, { at: number; ket: Promise<KetQua> }>();
const NHO_MS = 60_000;

function donKho(): void {
  const nguong = Date.now() - NHO_MS;
  for (const [ma, muc] of dangXuLy) if (muc.at < nguong) dangXuLy.delete(ma);
}

async function doiMa(code: string, codeVerifier: string): Promise<KetQua> {
  const db = getDB();
  const p = providerById(db, "hub");
  if (!p) return { ok: false, status: 400, error: "Chưa khai nhà cung cấp Hub" };

  let claims: { issuer: string; subject: string; name: string; sid?: string };
  try {
    const config = await discover(p);
    // Thư viện suy redirect_uri bằng cách bỏ query khỏi URL này → ra đúng địa chỉ relay đã đăng ký.
    // Không truyền expectedState vì luồng nhúng không dùng state (mã đi qua postMessage, không qua URL).
    const relay = new URL(HUB_RELAY);
    relay.searchParams.set("code", code);
    const meta = config.serverMetadata();
    if (meta.authorization_response_iss_parameter_supported) relay.searchParams.set("iss", meta.issuer);
    const tokens = await client.authorizationCodeGrant(config, relay, { pkceCodeVerifier: codeVerifier });
    const c = tokens.claims();
    if (!c) throw new Error("Hub không trả id_token");
    claims = { issuer: String(c.iss), subject: String(c.sub), name: String(c.name || "Người dùng"), sid: c.sid ? String(c.sid) : undefined };
  } catch (e) {
    // Hub không debug xuyên được vào iframe khác domain, và log container thì hai bên đều không xem
    // chung được — nên trả NGUYÊN VĂN lỗi của nhà cung cấp về cho trang nhúng hiển thị. Chuỗi này là
    // mã lỗi giao thức (invalid_grant, invalid_request…), không phải bí mật.
    const err = e as { error?: string; error_description?: string; message?: string };
    const chiTiet = [err.error, err.error_description || err.message].filter(Boolean).join(" — ").slice(0, 300);
    console.error(`[embed] đổi mã thất bại (verifier ${codeVerifier.length} ký tự):`, chiTiet);
    return { ok: false, status: 401, error: "Hub không xác nhận được lượt đăng nhập", hubError: chiTiet || "không rõ" };
  }

  // Hub không phát email; checkAudience biết điều đó (danh sách domain rỗng = Hub tự bảo đảm người của trường)
  const gate = checkAudience(p, { ...claims, emailVerified: false });
  if (!gate.ok) return { ok: false, status: 403, error: "Tài khoản không được phép vào" };

  const res = linkIdentity(db, claims);
  if (!res.ok) return { ok: false, status: 409, error: "Định danh này đã gắn tài khoản khác" };
  if (res.created || res.linked) {
    logActivity(res.user.name, res.created ? `tạo tài khoản qua ${p.label} (nhúng)` : `đăng nhập ${p.label} (nhúng)`, res.user.name, "/settings?tab=users");
  }
  persist();
  return { ok: true, userId: res.user.id, name: res.user.name, role: res.user.role, sid: claims.sid, mins: sessionMinutes(p) };
}

export async function POST(req: NextRequest) {
  const { code, codeVerifier } = (await req.json().catch(() => ({}))) as { code?: string; codeVerifier?: string };
  if (!code || !codeVerifier) return NextResponse.json({ error: "Thiếu code hoặc code_verifier" }, { status: 400 });

  donKho();
  const daCo = dangXuLy.get(code);
  const lapLai = !!daCo;
  const ket = await (daCo?.ket ?? (() => {
    const moi = doiMa(code, codeVerifier);
    dangXuLy.set(code, { at: Date.now(), ket: moi });
    return moi;
  })());
  if (lapLai) console.log(`[embed] mã lặp lại — dùng chung kết quả lượt đầu (${ket.ok ? "thành công" : "lỗi"})`);

  if (!ket.ok) {
    return NextResponse.json({ error: ket.error, hubError: ket.hubError, verifierLength: codeVerifier.length, deduped: lapLai }, { status: ket.status });
  }

  const out = NextResponse.json({ ok: true, user: { id: ket.userId, name: ket.name, role: ket.role }, deduped: lapLai });
  // Trong iframe cross-site, cookie SameSite=Lax KHÔNG được gửi kèm → phiên coi như không tồn tại.
  // Phải None + Secure, và Partitioned (CHIPS) để trình duyệt vẫn cho dùng khi đã chặn cookie bên
  // thứ ba: cookie này bị khoá theo cặp (Hub nhúng ↔ Factory), không dùng lại được ở ngữ cảnh khác.
  out.cookies.set({
    name: SESSION_COOKIE, value: makeToken(ket.userId, { idp: "hub", sid: ket.sid, mins: ket.mins }),
    httpOnly: true, sameSite: "none", secure: true, partitioned: true, path: "/", maxAge: ket.mins * 60,
  });
  return out;
}
