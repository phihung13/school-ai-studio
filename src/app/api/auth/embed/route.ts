// ── Đổi mã uỷ quyền nhận qua postMessage (luồng nhúng iframe của Hub) ───────────────────────────
// Khác Đường A ở ĐÚNG MỘT CHỖ: `code` không về theo địa chỉ quay về của Factory mà do Hub chuyển
// sang bằng postMessage, nên redirect_uri lúc đổi mã là địa chỉ relay CỦA HUB. Mọi thứ còn lại —
// PKCE, kiểm chữ ký id_token, nối định danh — dùng lại nguyên logic Đường A.
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

export async function POST(req: NextRequest) {
  const db = getDB();
  const p = providerById(db, "hub");
  if (!p) return NextResponse.json({ error: "Chưa khai nhà cung cấp Hub" }, { status: 400 });

  const { code, codeVerifier } = (await req.json().catch(() => ({}))) as { code?: string; codeVerifier?: string };
  if (!code || !codeVerifier) return NextResponse.json({ error: "Thiếu code hoặc code_verifier" }, { status: 400 });

  let claims;
  try {
    const config = await discover(p);
    // Thư viện suy redirect_uri bằng cách bỏ query khỏi URL này → ra đúng địa chỉ relay đã đăng ký.
    // Không truyền expectedState vì luồng nhúng không dùng state (mã đi qua postMessage, không qua URL).
    const relay = new URL(HUB_RELAY);
    relay.searchParams.set("code", code);
    // Hub khai authorization_response_iss_parameter_supported=true (RFC 9207), nên openid-client ĐÒI
    // phản hồi phải mang `iss` và tự chặn với "invalid response encountered" TRƯỚC khi gọi mạng nếu
    // thiếu. Luồng redirect thật có sẵn tham số này trong URL; luồng nhúng nhận mã qua postMessage nên
    // phải tự đắp lại từ metadata — đây đúng là chỗ không thể bê nguyên logic Đường A sang.
    const meta = config.serverMetadata();
    if (meta.authorization_response_iss_parameter_supported) relay.searchParams.set("iss", meta.issuer);
    const tokens = await client.authorizationCodeGrant(config, relay, { pkceCodeVerifier: codeVerifier });
    const c = tokens.claims();
    if (!c) throw new Error("Hub không trả id_token");
    claims = {
      issuer: String(c.iss), subject: String(c.sub),
      name: String(c.name || "Người dùng"),
      sid: c.sid ? String(c.sid) : undefined,
    };
  } catch (e) {
    // Hub không debug xuyên được vào iframe khác domain, và log container thì hai bên đều không xem
    // chung được — nên trả NGUYÊN VĂN lỗi của nhà cung cấp về cho trang nhúng hiển thị. Chuỗi này là
    // mã lỗi giao thức (invalid_grant, invalid_request…), không phải bí mật.
    const err = e as { error?: string; error_description?: string; message?: string };
    const chiTiet = [err.error, err.error_description || err.message].filter(Boolean).join(" — ").slice(0, 300);
    console.error(`[embed] đổi mã thất bại (verifier ${codeVerifier.length} ký tự):`, chiTiet);
    return NextResponse.json({
      error: "Hub không xác nhận được lượt đăng nhập",
      hubError: chiTiet || "không rõ",
      verifierLength: codeVerifier.length,   // để hai bên khỏi cãi nhau về độ dài PKCE
    }, { status: 401 });
  }

  // Hub không phát email; checkAudience biết điều đó (danh sách domain rỗng = Hub tự bảo đảm người của trường)
  const gate = checkAudience(p, { ...claims, emailVerified: false });
  if (!gate.ok) return NextResponse.json({ error: "Tài khoản không được phép vào" }, { status: 403 });

  const res = linkIdentity(db, claims);
  if (!res.ok) return NextResponse.json({ error: "Định danh này đã gắn tài khoản khác" }, { status: 409 });
  if (res.created || res.linked) {
    logActivity(res.user.name, res.created ? `tạo tài khoản qua ${p.label} (nhúng)` : `đăng nhập ${p.label} (nhúng)`, res.user.name, "/settings?tab=users");
  }
  persist();

  const mins = sessionMinutes(p);
  const out = NextResponse.json({ ok: true, user: { id: res.user.id, name: res.user.name, role: res.user.role } });
  // Trong iframe cross-site, cookie SameSite=Lax KHÔNG được gửi kèm → phiên coi như không tồn tại.
  // Phải None + Secure, và Partitioned (CHIPS) để trình duyệt vẫn cho dùng khi đã chặn cookie bên
  // thứ ba: cookie này bị khoá theo cặp (Hub nhúng ↔ Factory), không dùng lại được ở ngữ cảnh khác.
  out.cookies.set({
    name: SESSION_COOKIE, value: makeToken(res.user.id, { idp: p.id, sid: claims.sid, mins }),
    httpOnly: true, sameSite: "none", secure: true, partitioned: true, path: "/", maxAge: mins * 60,
  });
  return out;
}
