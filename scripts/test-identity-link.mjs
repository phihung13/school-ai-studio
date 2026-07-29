// ── Bài kiểm bắt buộc của hợp đồng app ngoài (Biến thể B) ───────────────────────────────────────
// Chạy: node --experimental-strip-types scripts/test-identity-link.mjs
// Kiểm đúng những điều dễ làm hỏng dữ liệu thật:
//   1. Đăng nhập 10 lần vẫn CHỈ MỘT tài khoản, MỘT dòng liên kết (idempotent).
//   2. Người đã có tài khoản cũ đăng nhập bằng Google thì được nối vào chính tài khoản đó
//      — giữ nguyên vai trò và dữ liệu, KHÔNG đẻ hồ sơ trắng.
//   3. Đổi nhà cung cấp (Google → Hub): subject khác hẳn nhưng vẫn ra đúng người, nhờ cột issuer.
//   4. Email đã gắn định danh khác của cùng nhà cung cấp thì bị CHẶN.
//   5. Tài khoản ngoài trường bị từ chối; claim hd giả cũng không lọt.
import { linkIdentity, revokeSessions, userIdFromLogoutToken } from "../src/lib/identity-link.ts";
import { checkAudience } from "../src/lib/oidc.ts";

const GOOGLE = "https://accounts.google.com";
const HUB = "https://hub.truongvietanh.com/oidc";
// Google: có email + đòi claim hd. Hub: KHÔNG phát email, không lọc domain (domainList rỗng).
const cfg = { id: "google", label: "Google", discoveryUrl: "", clientId: "", clientSecret: "", domains: "truongvietanh.com", domainList: ["truongvietanh.com"], source: "app" };
const cfgHub = { id: "hub", label: "tài khoản trường", discoveryUrl: "", clientId: "", clientSecret: "", domains: "", domainList: [], source: "app" };

let pass = 0, fail = 0;
const check = (ten, dieuKien) => { if (dieuKien) { pass++; console.log("  ✓", ten); } else { fail++; console.log("  ✗", ten); } };
const newDb = (users = []) => ({ users, identityLinks: [] });

console.log("1. Đăng nhập nhiều lần chỉ ra MỘT tài khoản");
{
  const db = newDb();
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const r = linkIdentity(db, { issuer: GOOGLE, subject: "sub-111", email: "co.lan@truongvietanh.com", name: "Nguyễn Thị Lan" });
    ids.push(r.ok ? r.user.id : "LOI");
  }
  check("10 lượt ra cùng một mã tài khoản", new Set(ids).size === 1);
  check("bảng người dùng chỉ có 1 dòng", db.users.length === 1);
  check("bảng liên kết chỉ có 1 dòng", db.identityLinks.length === 1);
  check("lần đầu là tạo mới, các lần sau thì không", db.users[0].role === "teacher");
}

console.log("2. Nối vào tài khoản CŨ, không đẻ hồ sơ trắng");
{
  const cu = { id: "tt.minh", name: "Trần Minh", role: "lead", title: "Tổ trưởng Toán", subject: "Toán", email: "TT.Minh@truongvietanh.com" };
  const db = newDb([cu]);
  const r = linkIdentity(db, { issuer: GOOGLE, subject: "sub-222", email: "tt.minh@truongvietanh.com", name: "Trần Minh (Google)" });
  check("ra đúng tài khoản cũ", r.ok && r.user.id === "tt.minh");
  check("KHÔNG tạo tài khoản mới", db.users.length === 1);
  check("giữ nguyên vai tổ trưởng", db.users[0].role === "lead" && db.users[0].title === "Tổ trưởng Toán");
  check("khớp email không phân biệt hoa thường", r.ok && r.created === false);
}

console.log("3. Đổi nhà cung cấp (Google → Hub) vẫn ra đúng người");
{
  const db = newDb();
  const a = linkIdentity(db, { issuer: GOOGLE, subject: "sub-333", email: "co.hoa@truongvietanh.com", name: "Cô Hoa" });
  const b = linkIdentity(db, { issuer: HUB, subject: "uuid-khac-han", email: "co.hoa@truongvietanh.com", name: "Cô Hoa" });
  check("vẫn là một tài khoản", a.ok && b.ok && a.user.id === b.user.id);
  check("có 2 dòng liên kết, khác issuer", db.identityLinks.length === 2 && new Set(db.identityLinks.map((l) => l.issuer)).size === 2);
  check("không đẻ tài khoản thứ hai", db.users.length === 1);
}

console.log("4. Chặn khi email đã gắn định danh khác của CÙNG nhà cung cấp");
{
  const db = newDb();
  linkIdentity(db, { issuer: GOOGLE, subject: "sub-A", email: "co.mai@truongvietanh.com", name: "Cô Mai" });
  const r = linkIdentity(db, { issuer: GOOGLE, subject: "sub-B", email: "co.mai@truongvietanh.com", name: "Ai đó" });
  check("bị chặn, không ghi đè", !r.ok && r.err === "khoa-khac-nguoi");
  check("bảng liên kết vẫn 1 dòng", db.identityLinks.length === 1);
}

console.log("5. Hàng rào domain (kiểm ở phía máy chủ)");
{
  // truongvietanh.com là Google Workspace (MX aspmx.l.google.com) → tài khoản trường LUÔN có claim hd
  const claims = (over) => ({ issuer: GOOGLE, subject: "s", email: "a@truongvietanh.com", emailVerified: true, name: "A", hd: "truongvietanh.com", ...over });
  check("email trường, đã xác thực, hd đúng → cho vào", checkAudience(cfg, claims()).ok);
  check("tài khoản Google cá nhân (không có hd) → chặn dù email trông giống", !checkAudience(cfg, claims({ hd: undefined })).ok);
  check("nhà cung cấp khác (Hub) không phát hd → vẫn cho vào theo domain email", checkAudience(cfg, { ...claims({ hd: undefined }), issuer: HUB }).ok);
  check("gmail cá nhân → chặn", !checkAudience(cfg, claims({ email: "ai.do@gmail.com" })).ok);
  check("email chưa xác thực → chặn", !checkAudience(cfg, claims({ emailVerified: false })).ok);
  check("claim hd của tổ chức khác → chặn dù email trông giống", !checkAudience(cfg, claims({ hd: "truonggiaokhac.com" })).ok);
  check("domain lồng giả mạo → chặn", !checkAudience(cfg, claims({ email: "x@truongvietanh.com.evil.net" })).ok);
  check("Hub không khai domain → cho qua (Hub đã xác thực người của trường)", checkAudience(cfgHub, { ...claims({ hd: undefined, email: undefined }), issuer: HUB }).ok);
}

console.log("6. Nhà cung cấp KHÔNG phát email (School Data Hub)");
{
  const db = newDb();
  const a = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-1", name: "Cô Thu", sid: "sid-1" });
  const b = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-1", name: "Cô Thu", sid: "sid-2" });
  check("lần đầu mở tài khoản mới, không cần email", a.ok && a.created && !db.users[0].email);
  check("lần hai vào lại đúng tài khoản đó", b.ok && b.user.id === a.user.id && db.users.length === 1);
  check("sid mới được ghi đè để tra ngược lúc đăng xuất từ xa", db.identityLinks[0].lastSid === "sid-2");
  check("vẫn chỉ một dòng liên kết", db.identityLinks.length === 1);
}

console.log("7. Nút \"Liên kết tài khoản\" — người đã có tài khoản tự nối");
{
  const cu = { id: "qt.hung", name: "Anh Hùng", role: "admin", title: "Quản trị học thuật", email: "hung@truongvietanh.com" };
  const db = newDb([cu]);
  const r = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-9", name: "Nguyễn Phi Hùng" }, { linkTo: "qt.hung" });
  check("gắn vào đúng tài khoản đang đăng nhập", r.ok && r.user.id === "qt.hung");
  check("KHÔNG đẻ tài khoản thứ hai", db.users.length === 1);
  check("giữ nguyên vai quản trị", db.users[0].role === "admin");
  const lai = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-9", name: "Nguyễn Phi Hùng" });
  check("lần sau đăng nhập thẳng vào tài khoản đã nối", lai.ok && lai.user.id === "qt.hung" && db.users.length === 1);
  const nguoiKhac = { id: "gv.lan", name: "Cô Lan", role: "teacher", title: "Giáo viên" };
  db.users.push(nguoiKhac);
  const cheo = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-khac", name: "Ai đó" }, { linkTo: "qt.hung" });
  check("một tài khoản không gắn được hai định danh cùng nhà cung cấp", !cheo.ok && cheo.err === "khoa-khac-nguoi");
}

console.log("8. Không cho mở tài khoản mới khi bị cấm");
{
  const db = newDb();
  const r = linkIdentity(db, { issuer: HUB, subject: "hub-uuid-2", name: "Người lạ" }, { allowCreate: false });
  check("bị từ chối", !r.ok && r.err === "khong-co-tai-khoan");
  check("không có tài khoản nào được tạo", db.users.length === 0);
}

console.log("9. Đăng xuất từ xa (back-channel logout)");
{
  const db = newDb();
  linkIdentity(db, { issuer: HUB, subject: "hub-uuid-3", name: "Thầy Bình", sid: "sid-abc" });
  const uid = db.users[0].id;
  check("tra ra người từ sub", userIdFromLogoutToken(db, HUB, "hub-uuid-3", undefined) === uid);
  check("tra ra người từ sid khi logout_token không có sub", userIdFromLogoutToken(db, HUB, undefined, "sid-abc") === uid);
  check("nhà cung cấp khác thì không tra nhầm", userIdFromLogoutToken(db, GOOGLE, "hub-uuid-3", "sid-abc") === null);
  const truoc = Date.now();
  revokeSessions(db, uid, new Date(truoc).toISOString());
  check("đã đóng mốc thu hồi phiên", !!db.users[0].sessionsValidFrom);
  // verifyToken sẽ so: token phát TRƯỚC mốc là chết, phát SAU mốc vẫn sống
  check("token cũ (phát trước mốc) bị coi là hết hiệu lực", truoc - 1000 < Date.parse(db.users[0].sessionsValidFrom));
  check("token cấp lại sau khi đăng nhập lại vẫn sống", truoc + 1000 > Date.parse(db.users[0].sessionsValidFrom));
}

console.log(`\n${pass} đạt · ${fail} hỏng`);
process.exit(fail ? 1 : 0);
