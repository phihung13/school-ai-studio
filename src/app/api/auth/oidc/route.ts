// Bước 1 của đăng nhập một lần: thư viện OIDC dựng URL uỷ quyền (kèm PKCE), app chỉ giữ lượt bắt tay.
// ?p=<id nhà cung cấp> — thiếu thì lấy nhà cung cấp đầu tiên đang bật (một địa chỉ, nhiều lối vào).
// ?link=1 — người dùng ĐANG đăng nhập muốn gắn định danh này vào chính tài khoản của họ.
// ?silent=1 — gia hạn im lặng (prompt=none), dùng khi phiên ngắn của Hub vừa hết hạn.
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/store";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { OIDC_COOKIE, originOf, packHandshake, providerById, providers, startLogin } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getDB();
  const origin = originOf(req);
  const wanted = req.nextUrl.searchParams.get("p") || "";
  const p = wanted ? providerById(db, wanted) : providers(db)[0];
  if (!p) return NextResponse.redirect(`${origin}/login?err=chua-cau-hinh`);

  // Liên kết chỉ có nghĩa khi đang đăng nhập sẵn — nếu không, cứ coi như đăng nhập thường.
  const me = req.nextUrl.searchParams.get("link") === "1"
    ? verifyToken(req.cookies.get(SESSION_COOKIE)?.value)
    : null;
  const silent = req.nextUrl.searchParams.get("silent") === "1";

  try {
    const { url, handshake } = await startLogin(p, origin, { linkTo: me?.id, silent });
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, packHandshake(handshake), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: origin.startsWith("https://"),
    });
    return res;
  } catch (e) {
    // discovery hỏng (sai địa chỉ, mất mạng, nhà cung cấp đang tắt) — đừng để người dùng thấy trang trắng
    console.error(`[oidc] không khởi tạo được lượt đăng nhập với ${p.id}:`, e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${origin}/login?err=khong-ket-noi`);
  }
}
