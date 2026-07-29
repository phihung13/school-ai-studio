// Bước 2: thư viện đổi mã lấy token và KIỂM CHỮ KÝ id_token (JWKS, tự xoay khoá), app chỉ còn ba
// việc của riêng mình — chặn người ngoài (checkAudience), nối định danh vào đúng tài khoản
// (linkIdentity), và cấp phiên với vòng đời do nhà cung cấp quy định.
// Địa chỉ này DÙNG CHUNG cho mọi nhà cung cấp; biết đang trả lời ai nhờ cookie bắt tay.
import { NextRequest, NextResponse } from "next/server";
import { getDB, logActivity, persist } from "@/lib/store";
import { makeToken, SESSION_COOKIE } from "@/lib/auth";
import {
  checkAudience, finishLogin, LAST_PROVIDER_COOKIE, OIDC_COOKIE, originOf, providerById, readHandshake, sessionMinutes,
} from "@/lib/oidc";
import { linkIdentity } from "@/lib/identity-link";

export const dynamic = "force-dynamic";
export const ID_TOKEN_COOKIE = "vaks_idt"; // giữ id_token làm hint khi đăng xuất khỏi nhà cung cấp

export async function GET(req: NextRequest) {
  const db = getDB();
  const origin = originOf(req);
  const secure = origin.startsWith("https://");
  const fail = (err: string, back = "/login") => {
    const r = NextResponse.redirect(`${origin}${back}?err=${err}`);
    r.cookies.set(OIDC_COOKIE, "", { path: "/", maxAge: 0 });
    return r;
  };

  const hs = readHandshake(req.cookies.get(OIDC_COOKIE)?.value);
  const err = req.nextUrl.searchParams.get("error");
  if (err) {
    // prompt=none mà nhà cung cấp hết phiên → login_required: đường bình thường của gia hạn im lặng,
    // không phải sự cố; đưa người dùng về trang đăng nhập, đừng doạ họ bằng thông báo lỗi.
    if (["login_required", "interaction_required", "consent_required", "account_selection_required"].includes(err)) {
      return NextResponse.redirect(`${origin}/login`);
    }
    if (err === "access_denied") return fail("huy"); // người dùng tự bấm Huỷ
    // Còn lại là app gửi sai yêu cầu (tham số nhà cung cấp không nhận, client sai…) — lỗi của mình,
    // phải log đủ để sửa, và nói thật với người dùng thay vì đổ cho họ "đã huỷ".
    console.error(`[oidc] ${hs?.providerId ?? "?"} từ chối: ${err} — ${req.nextUrl.searchParams.get("error_description") ?? ""}`);
    return fail("nha-cung-cap-tu-choi");
  }
  if (!hs) return fail("phien-het-han");
  const p = providerById(db, hs.providerId);
  if (!p) return fail("chua-cau-hinh");

  let claims;
  try {
    // currentUrl phải là địa chỉ CÔNG KHAI: sau proxy, req.url là localhost và sẽ không khớp redirect_uri.
    const currentUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, origin);
    claims = await finishLogin(p, currentUrl, hs);
  } catch (e) {
    console.error(`[oidc] ${p.id}: đổi mã thất bại:`, e instanceof Error ? e.message : e);
    return fail("google-tu-choi");
  }

  const gate = checkAudience(p, claims);
  if (!gate.ok) return fail(gate.err);

  const res = linkIdentity(db, {
    issuer: claims.issuer, subject: claims.subject, email: claims.email, name: claims.name, sid: claims.sid,
  }, { linkTo: hs.linkTo });
  if (!res.ok) {
    console.error(`[oidc] ${p.id}: chặn — ${res.err} (sub ${claims.subject.slice(0, 8)}…)`);
    return fail(res.err === "khoa-khac-nguoi" ? "trung-lien-ket" : "khong-co-tai-khoan");
  }
  if (res.created || res.linked) {
    logActivity(res.user.name,
      res.created ? `tạo tài khoản qua ${p.label}` : hs.linkTo ? `liên kết tài khoản với ${p.label}` : `đăng nhập bằng ${p.label}`,
      res.user.name, "/settings?tab=users");
  }
  persist();

  const mins = sessionMinutes(p);
  const out = NextResponse.redirect(`${origin}/`);
  out.cookies.set(SESSION_COOKIE, makeToken(res.user.id, { idp: p.id, sid: claims.sid, mins }), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: mins * 60, secure,
  });
  // gợi ý để trang đăng nhập biết thử gia hạn im lặng với đúng nhà cung cấp lần sau
  out.cookies.set(LAST_PROVIDER_COOKIE, p.id, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure });
  if (claims.idToken) {
    out.cookies.set(ID_TOKEN_COOKIE, claims.idToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: mins * 60, secure });
  }
  out.cookies.set(OIDC_COOKIE, "", { path: "/", maxAge: 0 });
  return out;
}
