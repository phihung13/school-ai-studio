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

export function makeToken(userId: string): string {
  const db = getDB();
  const payload = Buffer.from(JSON.stringify({ u: userId, t: Date.now() })).toString("base64url");
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
    const { u, t } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - t > 1000 * 60 * 60 * 24 * 7) return null; // 7 ngày
    return db.users.find((x) => x.id === u) || null;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
