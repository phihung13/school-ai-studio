// ── Nối định danh ngoài (OIDC) vào tài khoản trong app ──────────────────────────────────────────
// Đây là chỗ dễ làm hỏng dữ liệu thật nhất: app ĐÃ có người dùng, nếu đăng nhập bằng nhà cung cấp
// mới mà đẻ ra một hồ sơ trắng thì giáo viên mở lên thấy mất sạch việc cũ. Luật:
//   1. Đã có liên kết (issuer, subject) → dùng đúng tài khoản đó, không hỏi gì thêm.
//   2. Chưa có, mà nhà cung cấp CÓ phát email đã xác thực → nối vào tài khoản trùng email.
//   3. Chưa có, nhà cung cấp KHÔNG phát email (School Data Hub chỉ cho sub/name/hub_role) → không
//      có gì để khớp, đành mở tài khoản mới. Người đã có tài khoản dùng nút "Liên kết tài khoản
//      trường" trong app: lúc đó gọi hàm này kèm linkTo = tài khoản đang đăng nhập.
// Idempotent: đăng nhập bao nhiêu lần cũng một tài khoản, một dòng liên kết (id dòng liên kết băm
// từ chính issuer+subject nên chạy song song cũng không đẻ đôi).
import crypto from "crypto";
import type { DB } from "./store";
import type { IdentityLink, User } from "./shared";

export interface IdentityInput { issuer: string; subject: string; email?: string; name: string; sid?: string }
export interface LinkOptions {
  at?: string;
  /** Nối vào ĐÚNG tài khoản này (nút "Liên kết tài khoản trường" — người dùng đang đăng nhập sẵn) */
  linkTo?: string;
  /** false = cấm mở tài khoản mới; dùng khi chỉ muốn cho người đã có tài khoản vào */
  allowCreate?: boolean;
}
export type LinkResult =
  | { ok: true; user: User; created: boolean; linked: boolean }
  | { ok: false; err: "khoa-khac-nguoi" | "khong-co-tai-khoan" };

const linkId = (issuer: string, subject: string): string =>
  "il" + crypto.createHash("sha1").update(`${issuer}|${subject}`).digest("hex").slice(0, 16);

// Mã đăng nhập sinh từ email hoặc tên, cùng khuôn với tài khoản tạo tay (gv.lan, qt.hung…)
export function idFromEmail(email: string, taken: (id: string) => boolean): string {
  const base = email.split("@")[0]
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9.]+/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "gv";
  if (!taken(base)) return base;
  let i = 2; while (taken(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function linkIdentity(db: DB, input: IdentityInput, opts: LinkOptions = {}): LinkResult {
  const at = opts.at ?? new Date().toISOString();
  const allowCreate = opts.allowCreate !== false;
  const issuer = input.issuer.trim();
  const subject = input.subject.trim();
  const email = (input.email || "").trim().toLowerCase();
  if (!Array.isArray(db.identityLinks)) db.identityLinks = [];

  const attach = (user: User): LinkResult => {
    const link: IdentityLink = { id: linkId(issuer, subject), userId: user.id, issuer, subject, linkedAt: at, lastSid: input.sid };
    db.identityLinks = db.identityLinks.filter((l) => l.id !== link.id);
    db.identityLinks.push(link);
    return { ok: true, user, created: false, linked: true };
  };

  // 1. Đã từng đăng nhập bằng chính định danh này
  const existing = db.identityLinks.find((l) => l.issuer === issuer && l.subject === subject);
  if (existing) {
    const owner = db.users.find((u) => u.id === existing.userId);
    if (owner) {
      // đổi tài khoản đích (người dùng chủ động liên kết sang tài khoản khác) thì ghi lại
      if (opts.linkTo && opts.linkTo !== owner.id) {
        const target = db.users.find((u) => u.id === opts.linkTo);
        if (target) return attach(target);
      }
      if (input.sid && existing.lastSid !== input.sid) existing.lastSid = input.sid; // để back-channel logout tra ngược
      return { ok: true, user: owner, created: false, linked: input.sid ? true : false };
    }
    // liên kết mồ côi (tài khoản đã bị xoá) → dọn rồi xử như lần đầu
    db.identityLinks = db.identityLinks.filter((l) => l !== existing);
  }

  // 1b. Người dùng đang đăng nhập chủ động liên kết → gắn thẳng vào tài khoản của họ
  if (opts.linkTo) {
    const target = db.users.find((u) => u.id === opts.linkTo);
    if (!target) return { ok: false, err: "khong-co-tai-khoan" };
    if (db.identityLinks.some((l) => l.issuer === issuer && l.userId === target.id && l.subject !== subject)) {
      return { ok: false, err: "khoa-khac-nguoi" };
    }
    return attach(target);
  }

  // 2. Nối vào tài khoản cũ theo email (chỉ khi nhà cung cấp có phát email)
  let user = email ? db.users.find((u) => (u.email || "").trim().toLowerCase() === email) : undefined;
  let created = false;
  if (user) {
    // (issuer, userId) phải duy nhất: một tài khoản chỉ gắn MỘT định danh của mỗi nhà cung cấp.
    // Trùng ở đây nghĩa là email này đang trỏ tới người khác — chặn, để quản trị xử tay.
    if (db.identityLinks.some((l) => l.issuer === issuer && l.userId === user!.id && l.subject !== subject)) {
      return { ok: false, err: "khoa-khac-nguoi" };
    }
  } else {
    if (!allowCreate) return { ok: false, err: "khong-co-tai-khoan" };
    // 3. Người mới: mở tài khoản vai Giáo viên, KHÔNG đặt mật khẩu (người này vào bằng nhà cung cấp).
    const seed = email || `${input.name} ${subject.slice(0, 6)}`;
    const id = idFromEmail(seed, (candidate) => db.users.some((u) => u.id === candidate));
    user = { id, name: input.name.slice(0, 80), role: "teacher", title: "Giáo viên", email: email ? email.slice(0, 120) : undefined };
    db.users.push(user);
    created = true;
  }

  const res = attach(user);
  return res.ok ? { ...res, created } : res;
}

// Thu hồi mọi phiên của một người: đẩy mốc sessionsValidFrom lên hiện tại. Token phát trước mốc
// lập tức vô hiệu — cách duy nhất để back-channel logout đóng được phiên khi phiên là JWT tự cuộn.
export function revokeSessions(db: DB, userId: string, at: string = new Date().toISOString()): boolean {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return false;
  u.sessionsValidFrom = at;
  return true;
}

// Tra ngược người dùng từ logout_token: Hub gửi sub, và/hoặc sid của phiên bên nó.
export function userIdFromLogoutToken(db: DB, issuer: string, subject?: string, sid?: string): string | null {
  const links = db.identityLinks ?? [];
  if (subject) {
    const bySub = links.find((l) => l.issuer === issuer && l.subject === subject);
    if (bySub) return bySub.userId;
  }
  if (sid) {
    const bySid = links.find((l) => l.issuer === issuer && l.lastSid === sid);
    if (bySid) return bySid.userId;
  }
  return null;
}
