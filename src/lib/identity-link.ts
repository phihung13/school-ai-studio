// ── Nối định danh ngoài (OIDC) vào tài khoản trong app ──────────────────────────────────────────
// Đây là chỗ dễ làm hỏng dữ liệu thật nhất: app ĐÃ có người dùng, nếu đăng nhập bằng Google mà đẻ ra
// một hồ sơ trắng thì giáo viên mở lên thấy mất sạch việc cũ. Luật:
//   1. Đã có liên kết (issuer, subject) → dùng đúng tài khoản đó, không hỏi email nữa.
//   2. Chưa có → tìm theo email ĐÃ XÁC THỰC và nối vào tài khoản cũ.
//   3. Không có ai → mới mở tài khoản mới (vai Giáo viên).
// Idempotent: đăng nhập bao nhiêu lần cũng chỉ một tài khoản, một dòng liên kết (id của dòng liên kết
// băm từ chính issuer+subject nên chạy song song cũng không đẻ đôi).
import crypto from "crypto";
import type { DB } from "./store";
import type { IdentityLink, User } from "./shared";

export interface IdentityInput { issuer: string; subject: string; email: string; name: string }
export type LinkResult =
  | { ok: true; user: User; created: boolean; linked: boolean }
  | { ok: false; err: "khoa-khac-nguoi" };

const linkId = (issuer: string, subject: string): string =>
  "il" + crypto.createHash("sha1").update(`${issuer}|${subject}`).digest("hex").slice(0, 16);

export function linkIdentity(db: DB, input: IdentityInput, at: string = new Date().toISOString()): LinkResult {
  const issuer = input.issuer.trim();
  const subject = input.subject.trim();
  const email = input.email.trim().toLowerCase();
  if (!Array.isArray(db.identityLinks)) db.identityLinks = [];

  // 1. Đã từng đăng nhập bằng chính định danh này
  const existing = db.identityLinks.find((l) => l.issuer === issuer && l.subject === subject);
  if (existing) {
    const owner = db.users.find((u) => u.id === existing.userId);
    if (owner) return { ok: true, user: owner, created: false, linked: false };
    // liên kết mồ côi (tài khoản đã bị xoá) → dọn rồi xử như lần đầu
    db.identityLinks = db.identityLinks.filter((l) => l !== existing);
  }

  // 2. Nối vào tài khoản cũ theo email
  let user = db.users.find((u) => (u.email || "").trim().toLowerCase() === email);
  let created = false;
  if (user) {
    // (issuer, userId) phải duy nhất: một tài khoản chỉ gắn được MỘT định danh của mỗi nhà cung cấp.
    // Trùng ở đây nghĩa là email này đang trỏ tới người khác — chặn, để quản trị xử tay.
    if (db.identityLinks.some((l) => l.issuer === issuer && l.userId === user!.id && l.subject !== subject)) {
      return { ok: false, err: "khoa-khac-nguoi" };
    }
  } else {
    // 3. Người mới: mở tài khoản vai Giáo viên, KHÔNG đặt mật khẩu (người này vào bằng nhà cung cấp).
    const id = idFromEmail(email, (candidate) => db.users.some((u) => u.id === candidate));
    user = { id, name: input.name.slice(0, 80), role: "teacher", title: "Giáo viên", email: email.slice(0, 120) };
    db.users.push(user);
    created = true;
  }

  const link: IdentityLink = { id: linkId(issuer, subject), userId: user.id, issuer, subject, linkedAt: at };
  db.identityLinks.push(link);
  return { ok: true, user, created, linked: true };
}

// Mã đăng nhập sinh từ phần trước @ của email, cùng khuôn với tài khoản tạo tay (gv.lan, qt.hung…)
export function idFromEmail(email: string, taken: (id: string) => boolean): string {
  const base = email.split("@")[0]
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9.]+/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "gv";
  if (!taken(base)) return base;
  let i = 2; while (taken(`${base}${i}`)) i++;
  return `${base}${i}`;
}
