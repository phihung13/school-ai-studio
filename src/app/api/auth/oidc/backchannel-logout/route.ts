// ── Back-channel logout (OpenID Connect Back-Channel Logout 1.0) ────────────────────────────────
// Nhà cung cấp (School Data Hub) GỌI THẲNG địa chỉ này từ máy chủ của nó khi người dùng đăng xuất
// ở Hub hoặc bị khoá tài khoản. Không có trình duyệt nào tham gia, không có cookie nào gửi kèm —
// mọi thứ nằm trong logout_token, và phải kiểm chữ ký trước khi tin.
//
// Phiên của app là JWT tự cuộn nên không "xoá phiên" được như session store. Cách thu hồi:
// đẩy mốc sessionsValidFrom của người đó lên hiện tại → mọi token phát trước đó lập tức vô hiệu
// (xem verifyToken trong lib/auth.ts).
import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import { getDB, logActivity, persist } from "@/lib/store";
import { providers } from "@/lib/oidc";
import { revokeSessions, userIdFromLogoutToken } from "@/lib/identity-link";

export const dynamic = "force-dynamic";

// Đặc tả yêu cầu trả 200 khi đã xử lý, 400 khi token hỏng. KHÔNG được cache.
const ok = () => new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const db = getDB();
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("logout_token") || "");
  if (!token) return bad("Thiếu logout_token");

  // Nhà cung cấp nào gửi? Đọc iss ở phần thân (chưa tin), rồi đối chiếu với danh sách đang bật.
  let issuer = "";
  try { issuer = String(jose.decodeJwt(token).iss || ""); } catch { return bad("logout_token không đọc được"); }
  const p = providers(db).find((x) => {
    try { return new URL(x.discoveryUrl).origin === new URL(issuer).origin; } catch { return false; }
  });
  if (!p) return bad("Không nhận ra nhà cung cấp");

  // Giờ mới TIN: kiểm chữ ký bằng JWKS của chính nhà cung cấp đó, kèm iss/aud.
  let claims: jose.JWTPayload;
  try {
    const jwks = jose.createRemoteJWKSet(new URL(`${new URL(issuer).origin}/oidc/jwks`));
    ({ payload: claims } = await jose.jwtVerify(token, jwks, { issuer, audience: p.clientId }));
  } catch (e) {
    console.error("[oidc] logout_token sai chữ ký:", e instanceof Error ? e.message : e);
    return bad("logout_token không hợp lệ");
  }

  // Ràng buộc của đặc tả: phải có events chứa backchannel-logout, và KHÔNG được có nonce
  // (có nonce nghĩa là ai đó đang tái sử dụng id_token làm logout_token).
  const events = (claims.events ?? {}) as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(events, "http://schemas.openid.net/event/backchannel-logout")) {
    return bad("logout_token thiếu events");
  }
  if (claims.nonce) return bad("logout_token không được có nonce");

  const userId = userIdFromLogoutToken(db, issuer, claims.sub ? String(claims.sub) : undefined, claims.sid ? String(claims.sid) : undefined);
  if (!userId) return ok(); // không biết là ai (chưa từng đăng nhập vào app) — coi như đã xong

  revokeSessions(db, userId);
  logActivity(p.label, "đăng xuất từ xa", userId, "/settings?tab=users");
  persist();
  console.log(`[oidc] ${p.id} thu hồi phiên của ${userId}`);
  return ok();
}
