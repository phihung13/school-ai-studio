import crypto from "crypto";
import { cookies } from "next/headers";
import { getDB, User } from "./store";

const COOKIE = "vaks_session";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "vietanh2026";

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

// hash mật khẩu theo tài khoản (không lưu thô)
export function hashPw(pw: string, secret: string): string {
  return crypto.createHmac("sha256", secret + ":pw").update(String(pw || "")).digest("base64url");
}

// Phiên của app là JWT tự cuộn (không có kho phiên). Ngoài chủ nhân và thời điểm phát, token mang
// thêm: nhà cung cấp đã xác thực (idp) và sid của phiên bên đó — hai thứ này để đăng xuất cho đúng
// và để back-channel logout tra ngược. `mins` cho phép phiên ngắn hơn với nhà cung cấp đòi hỏi
// (Hub: 15 phút, vì hồ sơ không được cache lâu hơn thời hạn token).
export interface TokenOpts { idp?: string; sid?: string; mins?: number }

export function makeToken(userId: string, opts: TokenOpts = {}): string {
  const db = getDB();
  const body: Record<string, unknown> = { u: userId, t: Date.now() };
  if (opts.idp) body.p = opts.idp;
  if (opts.sid) body.s = opts.sid;
  if (opts.mins) body.m = opts.mins;
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload, db.secret)}`;
}

export function verifyToken(token: string | undefined): User | null {
  if (!token) return null;
  const db = getDB();
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expect = sign(payload, db.secret);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const { u, t, m } = JSON.parse(Buffer.from(payload, "base64url").toString());
    const maxMs = (Number(m) || 60 * 24 * 7) * 60 * 1000;   // mặc định 7 ngày; phiên qua Hub ngắn hơn
    if (Date.now() - t > maxMs) return null;
    const user = db.users.find((x) => x.id === u) || null;
    if (!user) return null;
    // Thu hồi phiên: back-channel logout đẩy mốc này lên hiện tại → mọi token phát TRƯỚC đó chết ngay.
    if (user.sessionsValidFrom && t < Date.parse(user.sessionsValidFrom)) return null;
    return user;
  } catch {
    return null;
  }
}

// Đọc phần thân token mà KHÔNG kiểm chữ ký — chỉ dùng cho việc phụ (biết phiên đến từ nhà cung cấp
// nào để gọi đúng địa chỉ đăng xuất). Mọi quyết định về quyền vẫn đi qua verifyToken.
export function peekToken(token: string | undefined): { u?: string; p?: string; s?: string } | null {
  try { return JSON.parse(Buffer.from(String(token).split(".")[0], "base64url").toString()); }
  catch { return null; }
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
