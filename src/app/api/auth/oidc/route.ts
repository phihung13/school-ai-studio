// Bước 1 của đăng nhập một lần: thư viện OIDC dựng URL uỷ quyền (kèm PKCE), app chỉ giữ lượt bắt tay.
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/store";
import { oidcConfig, OIDC_COOKIE, originOf, packHandshake, startLogin } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = oidcConfig(getDB());
  const origin = originOf(req);
  if (!cfg.clientId || !cfg.clientSecret) return NextResponse.redirect(`${origin}/login?err=chua-cau-hinh`);

  try {
    const { url, handshake } = await startLogin(cfg, origin);
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, packHandshake(handshake), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: origin.startsWith("https://"),
    });
    return res;
  } catch (e) {
    // discovery hỏng (sai địa chỉ, mất mạng, nhà cung cấp đổi cấu hình) — đừng để người dùng thấy trang trắng
    console.error("[oidc] không khởi tạo được lượt đăng nhập:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${origin}/login?err=khong-ket-noi`);
  }
}
