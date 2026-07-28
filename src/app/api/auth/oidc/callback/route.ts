// Bước 2: thư viện đổi mã lấy token và KIỂM CHỮ KÝ id_token (JWKS, tự xoay khoá), app chỉ còn
// hai việc của riêng mình — chặn người ngoài trường (checkAudience) và nối định danh vào đúng tài
// khoản cũ (linkIdentity). Mọi lối hỏng quay về /login kèm mã lỗi để trang login nói tiếng Việt.
import { NextRequest, NextResponse } from "next/server";
import { getDB, logActivity, persist } from "@/lib/store";
import { makeToken, SESSION_COOKIE } from "@/lib/auth";
import { checkAudience, finishLogin, oidcConfig, OIDC_COOKIE, originOf, readHandshake } from "@/lib/oidc";
import { linkIdentity } from "@/lib/identity-link";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getDB();
  const cfg = oidcConfig(db);
  const origin = originOf(req);
  const fail = (err: string) => {
    const r = NextResponse.redirect(`${origin}/login?err=${err}`);
    r.cookies.set(OIDC_COOKIE, "", { path: "/", maxAge: 0 });
    return r;
  };

  if (req.nextUrl.searchParams.get("error")) return fail("huy"); // người dùng bấm Huỷ ở màn nhà cung cấp
  if (!cfg.clientId || !cfg.clientSecret) return fail("chua-cau-hinh");
  const hs = readHandshake(req.cookies.get(OIDC_COOKIE)?.value);
  if (!hs) return fail("phien-het-han");

  let claims;
  try {
    // currentUrl phải là địa chỉ CÔNG KHAI: sau proxy, req.url là localhost và sẽ không khớp redirect_uri.
    const currentUrl = new URL(req.nextUrl.pathname + req.nextUrl.search, origin);
    claims = await finishLogin(cfg, currentUrl, hs);
  } catch (e) {
    console.error("[oidc] đổi mã thất bại:", e instanceof Error ? e.message : e);
    return fail("google-tu-choi");
  }

  const gate = checkAudience(cfg, claims);
  if (!gate.ok) return fail(gate.err);

  const res = linkIdentity(db, { issuer: claims.issuer, subject: claims.subject, email: claims.email, name: claims.name });
  if (!res.ok) {
    console.error(`[oidc] chặn: email ${claims.email} đã gắn định danh khác của ${claims.issuer}`);
    return fail("trung-lien-ket");
  }
  if (res.created || res.linked) {
    logActivity(res.user.name, res.created ? "tạo tài khoản qua đăng nhập một lần" : "nối tài khoản với đăng nhập một lần",
      `${res.user.name} (${claims.email})`, "/settings?tab=users");
    persist();
  }

  const out = NextResponse.redirect(`${origin}/`);
  out.cookies.set(SESSION_COOKIE, makeToken(res.user.id), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7, secure: origin.startsWith("https://"),
  });
  out.cookies.set(OIDC_COOKIE, "", { path: "/", maxAge: 0 });
  return out;
}
