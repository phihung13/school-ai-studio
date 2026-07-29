import { NextRequest, NextResponse } from "next/server";
import {
  getDB, persist, uid, nowIso, logActivity, node, pkgOf, atomsUnder, subjectOf, invalidateTreeIndex,
  PkgFields, AssetFormat, Job, JobItem, JobTask, User, DB, TreeNode,
} from "@/lib/store";
import { draftPackage, rewriteField, reviewPackage, generateAssetContent, tutorAnswer, testAiConnection, aiKey, aiModel } from "@/lib/ai";
import { importKnowledge, importRefs, importQuestions, importLadders } from "@/lib/import-kb";
import { newKC, newR } from "@/lib/ids";
import { flashcardsForAtom } from "@/lib/flashcards";
import { gradeCard } from "@/lib/srs";
import type { Grade } from "ts-fsrs";
import { makeToken, verifyToken, peekToken, SESSION_COOKIE, DEMO_PASSWORD, hashPw } from "@/lib/auth";
import { pushAssets, tutorTest, clearTutorToken } from "@/lib/tutor-push";
import { clearDiscoveryCache, endSessionUrl, oidcEnabled, originOf, providerById, providers } from "@/lib/oidc";
import { eventId, hubEventsOn, hubSubOf, sendHubEvent } from "@/lib/hub-events";

export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }); }
const FORMATS: AssetFormat[] = ["text", "worksheet", "slide", "quiz", "mindmap", "flashcard", "podcast", "video"];
const KINDS = ["subject", "grade", "chapter", "lesson", "point", "atom"];
// mỗi tầng chỉ được gắn dưới đúng tầng cha (subject=Môn ở gốc, grade=Lớp dưới Môn, …)
const PARENT_KIND: Record<string, string | null> = {
  subject: null, grade: "subject", chapter: "grade", lesson: "chapter", point: "lesson", atom: "point",
};
const ROLES = ["teacher", "lead", "admin", "principal"];
const PKG_FIELDS = ["objective", "explanation", "example", "counterExample", "commonMistake", "strategy", "questions"] as const;

// URL an toàn: chỉ http/https (chặn javascript:/data: → stored XSS)
function safeUrl(raw: string): string | null {
  let u = String(raw || "").trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && /\./.test(u)) u = "https://" + u; // tự thêm scheme
  try { const p = new URL(u); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null; } catch { return null; }
}
// quyền theo môn: teacher/lead chỉ thao tác trên môn của mình (chống IDOR chéo môn)
function ownsAtom(db: DB, user: User, atomId: string): boolean {
  if (user.role === "admin") return true;
  if (!user.subject) return true;
  const subj = subjectOf(db, atomId);
  return !!subj && subj.title.toLowerCase().includes(user.subject.toLowerCase());
}
function ownsPkg(db: DB, user: User, pkgId: string): boolean {
  const pkg = db.packages.find((p) => p.id === pkgId);
  return pkg ? ownsAtom(db, user, pkg.atomId) : true;
}
const DRAFT_MARK = /【Nháp AI|\(giáo viên (thay|điền|đ)|Phương án A \(đúng\)/;
function hasDraftMarker(f: PkgFields): boolean { return PKG_FIELDS.some((k) => DRAFT_MARK.test(f[k] || "")); }
function totalSpent(db: DB): number { return db.assets.reduce((s, a) => s + a.costUsd, 0) + db.jobs.reduce((s, j) => s + j.costUsd, 0); }

// Chỉ một runner chạy tại một thời điểm (mỗi task gọi AI) — chống chạy chồng qua ranh giới await
let activeRunner: string | null = null;

function markAssetsOutdated(pkgId: string) {
  const db = getDB();
  for (const a of db.assets) if (a.packageId === pkgId && a.status === "ready") a.status = "outdated";
}

// Biên dịch các "line item" của đơn thành hàng đợi task (khử trùng lặp atom×mức×định dạng)
function compileTasks(db: DB, items: JobItem[]): JobTask[] {
  const tasks: JobTask[] = []; const seen = new Set<string>();
  for (const it of items) {
    const atoms = atomsUnder(db, it.nodeId);
    const levels = it.levels.length ? it.levels : [1, 2, 3];
    for (const a of atoms) for (const lv of levels) {
      if (it.kind === "draft") {
        const key = `d|${a.id}|${lv}`; if (seen.has(key)) continue; seen.add(key);
        tasks.push({ atomId: a.id, code: a.code, title: a.title, level: lv, kind: "draft", status: "pending" });
      } else {
        for (const f of it.formats) {
          const key = `a|${a.id}|${lv}|${f}`; if (seen.has(key)) continue; seen.add(key);
          tasks.push({ atomId: a.id, code: a.code, title: a.title, level: lv, kind: "asset", format: f, status: "pending" });
        }
      }
    }
  }
  return tasks;
}

async function runJob(jobId: string) {
  if (activeRunner) return;
  activeRunner = jobId;
  try {
    const db = getDB();
    let job = db.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = "running"; persist();
    for (let i = 0; i < job.tasks.length; i++) {
      job = db.jobs.find((j) => j.id === jobId);        // re-find để bắt xoá/điều khiển từ request khác
      if (!job || job.status !== "running") return;
      const task = job.tasks[i];
      if (task.status !== "pending") continue;
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) { job.log.unshift("✗ Đã đạt trần chi phí AI tháng này — dừng."); job.status = "failed"; job.finishedAt = nowIso(); persist(); return; }
      const atom = node(db, task.atomId);
      if (!atom || atom.kind !== "atom") { task.status = "skipped"; persist(); continue; }
      try {
        if (task.kind === "draft") {
          const lv = task.level as 1 | 2 | 3;
          const existing = pkgOf(db, atom.id, lv);
          if (existing && existing.status === "approved") { task.status = "skipped"; job.log.unshift(`↷ ${atom.code} mức ${lv}: đã Chuẩn trường — giữ nguyên`); }
          else {
            const res = await draftPackage(db, atom, lv); const t = nowIso();
            if (existing) { existing.fields = res.content; existing.version++; existing.status = "draft_ai"; existing.updatedAt = t; existing.updatedBy = "AI (xưởng)"; existing.history.push({ version: existing.version, at: t, by: "AI (xưởng)", note: "Nháp lại từ xưởng sản xuất" }); markAssetsOutdated(existing.id); }
            else db.packages.push({ id: `${atom.id}-L${lv}`, atomId: atom.id, level: lv, status: "draft_ai", bloom: lv === 1 ? "Nhớ / Hiểu" : lv === 2 ? "Hiểu / Áp dụng" : "Áp dụng / Phân tích", fields: res.content, version: 1, updatedAt: t, updatedBy: "AI (xưởng)", history: [{ version: 1, at: t, by: "AI (xưởng)", note: "Nháp từ xưởng sản xuất" }] });
            job.tokens += res.tokens; job.costUsd = +(job.costUsd + res.costUsd).toFixed(4);
            task.status = "done"; job.log.unshift(`✓ Nháp ${atom.code} mức ${lv}`);
          }
        } else {
          const fmt = task.format!;
          const pkg = pkgOf(db, atom.id, task.level);
          if (!pkg) { task.status = "skipped"; job.log.unshift(`↷ ${atom.code} mức ${task.level}: chưa có gói nội dung → bỏ ${fmt}`); }
          else {
            const has = db.assets.find((a) => a.packageId === pkg.id && a.format === fmt && a.status === "ready");
            if (has) { task.status = "skipped"; job.log.unshift(`↷ ${atom.code} ${fmt}: đã có bản mới`); }
            else {
              const res = await generateAssetContent(db, pkg, atom, fmt);
              db.assets = db.assets.filter((a) => !(a.packageId === pkg.id && a.format === fmt));
              db.assets.push({ id: newR(db), packageId: pkg.id, format: fmt, status: "ready", content: res.content, createdAt: nowIso(), createdBy: "AI (xưởng)", model: res.model, tokens: res.tokens, costUsd: res.costUsd, pkgVersion: pkg.version });
              job.tokens += res.tokens; job.costUsd = +(job.costUsd + res.costUsd).toFixed(4);
              task.status = "done"; job.log.unshift(`✓ Sinh ${fmt} · ${atom.code} mức ${task.level}`);
            }
          }
        }
      } catch (e) { task.status = "failed"; job.failed++; job.log.unshift(`✗ ${atom.code}: ${e instanceof Error ? e.message : String(e)}`); }
      job.done = job.tasks.filter((t) => t.status !== "pending").length;
      if (job.log.length > 80) job.log.length = 80;
      persist();
    }
    job = db.jobs.find((j) => j.id === jobId);
    if (job && job.status === "running") { const allBad = job.tasks.every((t) => t.status === "failed" || t.status === "skipped"); job.status = job.failed > 0 && allBad ? "failed" : "done"; job.finishedAt = nowIso(); persist(); }
  } catch (e) {
    const db = getDB(); const job = db.jobs.find((j) => j.id === jobId);
    if (job) { job.status = "failed"; job.log.unshift(`✗ Lỗi: ${e instanceof Error ? e.message : String(e)}`); persist(); }
  } finally { activeRunner = null; }
}

export async function POST(req: NextRequest) {
  const db = getDB();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.op !== "string") return bad("Thiếu op");
  const { op } = body as { op: string } & Record<string, unknown>;

  // ---- auth ----
  if (op === "login") {
    const { username, userId, password } = body as { username?: string; userId?: string; password: string };
    const uname = String(username || userId || "").trim().toLowerCase();
    if (!uname) return bad("Nhập tên đăng nhập", 400);
    const user = db.users.find((u) => u.id.toLowerCase() === uname || (u.email || "").toLowerCase() === uname || u.name.toLowerCase() === uname);
    // mật khẩu riêng (đã hash) nếu tài khoản có; ngược lại dùng mật khẩu demo chung
    const ok = user && (user.password ? user.password === hashPw(String(password), db.secret) : String(password) === DEMO_PASSWORD);
    if (!user || !ok) return bad("Sai tên đăng nhập hoặc mật khẩu", 401);
    const safe = { id: user.id, name: user.name, role: user.role, subject: user.subject, title: user.title, email: user.email };
    const res = NextResponse.json({ ok: true, user: safe });
    res.cookies.set(SESSION_COOKIE, makeToken(user.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  if (op === "logout") {
    // Xoá cookie phía app là CHƯA đủ: nếu phiên đến từ một nhà cung cấp, phải kết thúc cả phiên bên
    // đó, nếu không lần bấm đăng nhập kế tiếp sẽ vào lại im lặng và người dùng tưởng chưa thoát được.
    const peek = peekToken(req.cookies.get(SESSION_COOKIE)?.value);
    const idp = peek?.p ? providerById(db, peek.p) : undefined;
    const origin = originOf(req);
    const endUrl = idp ? await endSessionUrl(idp, origin, req.cookies.get("vaks_idt")?.value) : null;
    const res = NextResponse.json({ ok: true, endSessionUrl: endUrl });
    for (const c of [SESSION_COOKIE, "vaks_idt"]) res.cookies.set(c, "", { maxAge: 0, path: "/" });
    return res;
  }

  const user: User | null = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return bad("Chưa đăng nhập", 401);
  const canReview = user.role === "lead" || user.role === "admin";
  const isAdmin = user.role === "admin";
  const canEdit = user.role === "teacher" || canReview;
  const who = `${user.name} (${user.title})`;

  try {
  switch (op) {
    case "savePackage": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { id, fields, note } = body as { id: string; fields: PkgFields; note?: string };
      const pkg = db.packages.find((p) => p.id === id);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (!ownsPkg(db, user, pkg.id)) return bad("Gói này thuộc môn khác — bạn không có quyền sửa", 403);
      // validate TOÀN BỘ trước (chỉ đọc), chỉ khi hợp lệ mới ghi (tránh mutate-before-validate)
      for (const k of PKG_FIELDS) if (typeof fields?.[k] !== "string") return bad("Thiếu trường " + k);
      if (pkg.status === "pending_review" && !canReview) return bad("Gói đang chờ duyệt — không thể sửa cho tới khi tổ trưởng quyết định", 409);
      for (const k of PKG_FIELDS) pkg.fields[k] = fields[k].slice(0, 8000);
      const wasApproved = pkg.status === "approved";
      pkg.version++;
      pkg.status = "edited";
      pkg.updatedAt = nowIso(); pkg.updatedBy = who;
      pkg.history.push({ version: pkg.version, at: pkg.updatedAt, by: who, note: wasApproved ? `Gỡ nhãn Chuẩn trường do chỉnh sửa — ${note || "cập nhật nội dung"}` : (note || "Cập nhật nội dung") });
      pkg.aiReport = undefined;
      markAssetsOutdated(pkg.id);
      logActivity(user.name, "cập nhật", `Gói ${pkg.id}`, `/package/${pkg.id}`);
      persist();
      return NextResponse.json({ ok: true, pkg });
    }
    case "submitPackage": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { id } = body as { id: string };
      const pkg = db.packages.find((p) => p.id === id);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (!ownsPkg(db, user, pkg.id)) return bad("Gói này thuộc môn khác", 403);
      if (pkg.status === "approved" || pkg.status === "pending_review") return bad("Gói không ở trạng thái cho phép gửi duyệt", 409);
      if (hasDraftMarker(pkg.fields)) return bad("Gói còn nội dung nháp AI/chỗ giữ chỗ chưa biên tập — hãy rà soát và thay bằng nội dung thật trước khi gửi duyệt");
      const atom = node(db, pkg.atomId)!;
      const rep = await reviewPackage(db, pkg, atom);
      const coreFlag = rep.content.flags.some((f) => /Đủ ý|Đúng kiến thức|Không bịa đặt/.test(f));
      if (coreFlag) return bad("AI Reviewer còn cờ cảnh báo về chất lượng — hãy chỉnh trước khi gửi duyệt: " + rep.content.flags[0]);
      pkg.aiReport = rep.content;
      pkg.status = "pending_review";
      pkg.updatedAt = nowIso(); pkg.updatedBy = who;
      pkg.history.push({ version: pkg.version, at: pkg.updatedAt, by: who, note: "Gửi duyệt (AI Reviewer đã chấm trước)" });
      logActivity(user.name, "gửi duyệt", `Gói ${pkg.id}`, `/package/${pkg.id}`);
      persist();
      // Tóm tắt gửi Hub — khoá theo gói+phiên bản+loại việc nên gửi lại bao nhiêu lần cũng một bản ghi
      sendHubEvent({
        externalId: eventId("pkg", pkg.id, pkg.version, "submitted"),
        eventType: "package_submitted", actorUserId: hubSubOf(db, user.id),
        payload: { package_id: pkg.id, atom_code: atom.code, atom_title: atom.title, level: pkg.level, version: pkg.version, by: user.name, at: pkg.updatedAt },
      });
      return NextResponse.json({ ok: true, pkg });
    }
    case "decidePackage": {
      if (!canReview) return bad("Chỉ tổ trưởng/quản trị được duyệt", 403);
      const { id, decision, note } = body as { id: string; decision: "approved" | "returned"; note: string };
      if (decision !== "approved" && decision !== "returned") return bad("Quyết định không hợp lệ");
      if (decision === "returned" && !note?.trim()) return bad("Trả lại phải kèm lý do góp ý");
      const cleanNote = (note || "").slice(0, 2000);
      const pkg = db.packages.find((p) => p.id === id);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (pkg.status !== "pending_review") return bad("Gói không ở trạng thái chờ duyệt");
      // không cho duyệt Chuẩn trường khi AI Reviewer còn cờ, trừ khi ghi đè có lý do
      if (decision === "approved" && (pkg.aiReport?.flags?.length || 0) > 0) {
        const override = (body as { override?: boolean }).override;
        if (!override || !note?.trim()) return bad("Gói còn " + pkg.aiReport!.flags.length + " cờ cảnh báo. Muốn duyệt vẫn phải ghi lý do và xác nhận ghi đè.", 409);
      }
      pkg.status = decision === "approved" ? "approved" : "edited";
      pkg.updatedAt = nowIso();
      pkg.history.push({ version: pkg.version, at: pkg.updatedAt, by: who, note: decision === "approved" ? `Duyệt lên Chuẩn trường${cleanNote ? " — " + cleanNote : ""}` : `Trả lại: ${cleanNote}` });
      db.reviews.unshift({ id: uid("rv_"), packageId: pkg.id, at: pkg.updatedAt, by: who, decision, note: cleanNote, aiReport: pkg.aiReport });
      logActivity(user.name, decision === "approved" ? "duyệt Chuẩn trường" : "trả lại", `Gói ${pkg.id}`, `/package/${pkg.id}`);
      persist();
      {
        const at = node(db, pkg.atomId);
        sendHubEvent({
          externalId: eventId("pkg", pkg.id, pkg.version, decision),
          eventType: decision === "approved" ? "package_approved" : "package_returned",
          actorUserId: hubSubOf(db, user.id),
          payload: { package_id: pkg.id, atom_code: at?.code, atom_title: at?.title, level: pkg.level, version: pkg.version, by: user.name, at: pkg.updatedAt, note: cleanNote || undefined },
        });
      }
      return NextResponse.json({ ok: true, pkg });
    }
    case "draftPackage": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { atomId } = body as { atomId: string };
      const level = Number((body as { level: number }).level) as 1 | 2 | 3;
      if (![1, 2, 3].includes(level)) return bad("Mức độ không hợp lệ");
      const atom = node(db, atomId);
      if (!atom || atom.kind !== "atom") return bad("Không tìm thấy nguyên tử", 404);
      if (!ownsAtom(db, user, atomId)) return bad("Nguyên tử thuộc môn khác", 403);
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này — không thể sinh thêm", 429);
      const res = await draftPackage(db, atom, level);
      const t = nowIso();
      let pkg = pkgOf(db, atomId, level);
      if (pkg) {
        if (pkg.status === "approved") return bad("Gói đã Chuẩn trường — hãy sửa thay vì nháp lại");
        pkg.fields = res.content; pkg.version++; pkg.status = "draft_ai"; pkg.updatedAt = t; pkg.updatedBy = "AI";
        pkg.history.push({ version: pkg.version, at: t, by: `AI (theo yêu cầu của ${user.name})`, note: "Nháp lại bằng AI" });
        markAssetsOutdated(pkg.id);
      } else {
        pkg = {
          id: `${atomId}-L${level}`, atomId, level, status: "draft_ai",
          bloom: level === 1 ? "Nhớ / Hiểu" : level === 2 ? "Hiểu / Áp dụng" : "Áp dụng / Phân tích",
          fields: res.content, version: 1, updatedAt: t, updatedBy: "AI",
          history: [{ version: 1, at: t, by: `AI (theo yêu cầu của ${user.name})`, note: "Nháp bằng AI" }],
        };
        db.packages.push(pkg);
      }
      logActivity(user.name, "nháp AI", `Gói ${pkg.id}`, `/package/${pkg.id}`);
      persist();
      return NextResponse.json({ ok: true, pkg, meter: { tokens: res.tokens, costUsd: res.costUsd, model: res.model } });
    }
    case "rewriteField": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { pkgId, field, instruction } = body as { pkgId: string; field: keyof PkgFields; instruction: string };
      if (!PKG_FIELDS.includes(field as (typeof PKG_FIELDS)[number])) return bad("Trường không hợp lệ");
      const pkg = db.packages.find((p) => p.id === pkgId);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (!ownsPkg(db, user, pkg.id)) return bad("Gói thuộc môn khác", 403);
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này", 429);
      const atom = node(db, pkg.atomId)!;
      const res = await rewriteField(db, pkg, atom, field, String(instruction || "viết lại rõ ràng hơn").slice(0, 500));
      return NextResponse.json({ ok: true, text: res.content, meter: { tokens: res.tokens, costUsd: res.costUsd, model: res.model } });
    }
    case "reviewNow": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { pkgId } = body as { pkgId: string };
      const pkg = db.packages.find((p) => p.id === pkgId);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (pkg.status === "pending_review" && !canReview) return bad("Gói đang chờ duyệt — không chạy lại chấm khi tổ trưởng chưa quyết định", 409);
      const rep = await reviewPackage(db, pkg, node(db, pkg.atomId)!);
      pkg.aiReport = rep.content;
      persist();
      return NextResponse.json({ ok: true, report: rep.content });
    }
    case "generateAsset": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { pkgId, format } = body as { pkgId: string; format: AssetFormat };
      if (!FORMATS.includes(format)) return bad("Định dạng không hợp lệ");
      const pkg = db.packages.find((p) => p.id === pkgId);
      if (!pkg) return bad("Không tìm thấy gói", 404);
      if (!ownsPkg(db, user, pkg.id)) return bad("Gói thuộc môn khác", 403);
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này", 429);
      const atom = node(db, pkg.atomId)!;
      const res = await generateAssetContent(db, pkg, atom, format);
      const old = db.assets.find((a) => a.packageId === pkgId && a.format === format);
      if (old) db.assets = db.assets.filter((a) => a !== old);
      const asset = {
        id: newR(db), packageId: pkgId, format, status: "ready" as const, content: res.content,
        createdAt: nowIso(), createdBy: who, model: res.model, tokens: res.tokens, costUsd: res.costUsd, pkgVersion: pkg.version,
      };
      db.assets.push(asset);
      logActivity(user.name, "sinh tài nguyên", `${format} — ${atom.code} mức ${pkg.level}`, `/asset/${asset.id}`);
      sendHubEvent({
        externalId: eventId("asset", asset.id),
        eventType: "asset_generated", actorUserId: hubSubOf(db, user.id),
        payload: { asset_id: asset.id, package_id: pkg.id, format, atom_code: atom.code, atom_title: atom.title, level: pkg.level, by: user.name, at: asset.createdAt },
      });
      persist();
      return NextResponse.json({ ok: true, asset });
    }
    case "buildJob": {
      if (!isAdmin) return bad("Chỉ quản trị được chạy xưởng sản xuất", 403);
      const { title, items } = body as { title?: string; items?: JobItem[] };
      if (!Array.isArray(items) || items.length === 0) return bad("Đơn sản xuất trống — thêm ít nhất một dòng phạm vi.");
      if (items.length > 40) return bad("Đơn có quá nhiều dòng — gộp lại giúp gọn.");
      const cleanItems: JobItem[] = [];
      for (const it of items) {
        const n = node(db, it.nodeId);
        if (!n) return bad("Có mục trong đơn không còn tồn tại trong cây.");
        const kind = it.kind === "asset" ? "asset" : "draft";
        const levels = (Array.isArray(it.levels) ? it.levels : []).map(Number).filter((l) => [1, 2, 3].includes(l));
        if (!levels.length) return bad(`Chọn ít nhất một mức (1/2/3) cho "${n.title}".`);
        const formats = kind === "asset" ? (Array.isArray(it.formats) ? it.formats.filter((f) => FORMATS.includes(f)) : []) : [];
        if (kind === "asset" && !formats.length) return bad(`Dòng "${n.title}" (Sinh học liệu) cần chọn ít nhất một định dạng.`);
        cleanItems.push({ nodeId: it.nodeId, nodeTitle: n.title, kind, formats, levels });
      }
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này — không thể chạy.", 429);
      const tasks = compileTasks(db, cleanItems);
      if (!tasks.length) return bad("Phạm vi đã chọn không có nguyên tử nào để sản xuất.");
      if (tasks.length > 3000) return bad(`Đơn quá lớn (${tasks.length} tác vụ) — thu hẹp phạm vi hoặc tách nhỏ.`);
      const canRun = !activeRunner && !db.jobs.some((j) => j.status === "running");
      const job: Job = {
        id: uid("job_"), title: (title?.trim() || "Đơn sản xuất").slice(0, 120), status: canRun ? "running" : "paused",
        items: cleanItems, tasks, total: tasks.length, done: 0, failed: 0,
        log: [canRun ? "Bắt đầu sản xuất…" : "Đưa vào hàng đợi — đang có đơn khác chạy."], tokens: 0, costUsd: 0, startedAt: nowIso(), by: who,
      };
      db.jobs.unshift(job);
      logActivity(user.name, "tạo đơn sản xuất", `${tasks.length} tác vụ`, "/batch");
      persist();
      if (canRun) void runJob(job.id);
      return NextResponse.json({ ok: true, jobId: job.id, tasks: tasks.length });
    }
    case "jobControl": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id, action } = body as { id: string; action: "pause" | "resume" | "stop" };
      const job = db.jobs.find((j) => j.id === id);
      if (!job) return bad("Không tìm thấy đơn", 404);
      if (action === "pause") { if (job.status === "running") { job.status = "paused"; job.log.unshift("⏸ Tạm dừng."); } }
      else if (action === "stop") { if (job.status === "running" || job.status === "paused") { job.status = "stopped"; job.finishedAt = nowIso(); job.log.unshift("⏹ Đã dừng."); } }
      else if (action === "resume") {
        if (job.status !== "paused") return bad("Đơn không ở trạng thái tạm dừng");
        if (activeRunner || db.jobs.some((j) => j.status === "running")) return bad("Đang có đơn khác chạy — chờ hoặc dừng đơn đó trước.", 409);
        if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này.", 429);
        job.status = "running"; job.log.unshift("▶ Tiếp tục sản xuất."); persist(); void runJob(job.id);
        return NextResponse.json({ ok: true });
      } else return bad("Hành động không hợp lệ");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "jobDelete": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id } = body as { id: string };
      const job = db.jobs.find((j) => j.id === id);
      if (!job) return bad("Không tìm thấy", 404);
      if (job.status === "running") job.status = "stopped"; // runner sẽ tự thoát ở vòng kế
      db.jobs = db.jobs.filter((j) => j.id !== id);
      logActivity(user.name, "xoá đơn sản xuất", job.title, "/batch");
      persist();
      return NextResponse.json({ ok: true });
    }
    // ===== Nhập & cập nhật dữ liệu (app chỉ ăn file SẠCH, code thuần) =====
    case "importKnowledge": {
      if (!isAdmin) return bad("Chỉ quản trị được nhập dữ liệu", 403);
      const { atoms, edges, dryRun } = body as { atoms?: unknown; edges?: unknown; dryRun?: boolean };
      if (!Array.isArray(atoms) && !Array.isArray(edges)) return bad("File không có mảng atoms/edges hợp lệ");
      const dr = dryRun !== false;                                     // mặc định dryRun (an toàn); chỉ ghi khi dryRun===false
      const result = importKnowledge(db, atoms, edges, { dryRun: dr });
      if (!dr) { invalidateTreeIndex(); logActivity(user.name, "nhập dữ liệu phân rã", `${result.atomsNew} mới · ${result.atomsUpdated} sửa · ${result.edgesNew} cạnh`, "/settings?tab=import"); persist(); }
      return NextResponse.json({ ok: true, result });
    }
    case "importQuestions": {
      if (!isAdmin) return bad("Chỉ quản trị được nhập dữ liệu", 403);
      const { questions, dryRun } = body as { questions?: unknown; dryRun?: boolean };
      if (!Array.isArray(questions)) return bad("File không có mảng questions hợp lệ");
      const dr = dryRun !== false;
      const result = importQuestions(db, questions, { dryRun: dr });
      if (!dr) { logActivity(user.name, "nhập ngân hàng câu hỏi", `${result.created} mới · ${result.updated} sửa · ${result.atomsTouched} nguyên tử`, "/settings?tab=import"); persist(); }
      return NextResponse.json({ ok: true, result });
    }
    case "importLadders": {
      if (!isAdmin) return bad("Chỉ quản trị được nhập dữ liệu", 403);
      const { ladders, dryRun, nguon } = body as { ladders?: unknown; dryRun?: boolean; nguon?: string };
      if (ladders == null) return bad("File không có dữ liệu thang Socratic");
      const dr = dryRun !== false;
      const result = importLadders(db, ladders, { dryRun: dr, nguon: typeof nguon === "string" ? nguon : undefined });
      if (!dr) { logActivity(user.name, "nhập thang Socratic", `${result.created} mới · ${result.updated} sửa · ${result.atomsTouched} nguyên tử`, "/settings?tab=import"); persist(); }
      return NextResponse.json({ ok: true, result });
    }
    case "importRefs": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { refs, dryRun } = body as { refs?: unknown; dryRun?: boolean };
      if (!Array.isArray(refs)) return bad("File không có mảng refs hợp lệ");
      const dr = dryRun !== false;
      const result = importRefs(db, refs, { dryRun: dr });
      if (!dr) { logActivity(user.name, "gắn tài liệu hàng loạt", `${result.attached} link · ${result.nodesTouched} mục`, "/settings?tab=import"); persist(); }
      return NextResponse.json({ ok: true, result });
    }
    case "refreshOutdated": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return bad("Đã đạt trần chi phí AI tháng này.", 429);
      const outdated = db.assets.filter((a) => a.status === "outdated");
      const tasks: JobTask[] = []; const seen = new Set<string>();
      for (const a of outdated) {
        const pkg = db.packages.find((p) => p.id === a.packageId); if (!pkg) continue;
        const atom = node(db, pkg.atomId); if (!atom) continue;
        const key = `${pkg.id}|${a.format}`; if (seen.has(key)) continue; seen.add(key);
        tasks.push({ atomId: atom.id, code: atom.code, title: atom.title, level: pkg.level, kind: "asset", format: a.format, status: "pending" });
      }
      if (!tasks.length) return NextResponse.json({ ok: true, count: 0 });
      const canRun = !activeRunner && !db.jobs.some((j) => j.status === "running");
      const job: Job = {
        id: uid("job_"), title: `Làm mới ${tasks.length} học liệu quá hạn`, status: canRun ? "running" : "paused",
        items: [], tasks, total: tasks.length, done: 0, failed: 0,
        log: [canRun ? "Bắt đầu làm mới…" : "Đưa vào hàng đợi — đang có đơn khác chạy."], tokens: 0, costUsd: 0, startedAt: nowIso(), by: who,
      };
      db.jobs.unshift(job);
      logActivity(user.name, "làm mới học liệu quá hạn", `${tasks.length} bản`, "/batch");
      persist();
      if (canRun) void runJob(job.id);
      return NextResponse.json({ ok: true, count: tasks.length, jobId: job.id });
    }
    case "flashGrade": {
      const { atomId, idx, grade } = body as { atomId: string; idx: number; grade: number };
      const atom = node(db, atomId);
      if (!atom || atom.kind !== "atom") return bad("Không tìm thấy nguyên tử", 404);
      const cards = flashcardsForAtom(db, atom);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cards.length) return bad("Thẻ không hợp lệ");
      if (![1, 2, 3, 4].includes(grade)) return bad("Mức đánh giá không hợp lệ");
      const cs = gradeCard(db, user.id, atomId, idx, grade as Grade);
      persist();
      return NextResponse.json({ ok: true, due: cs.due });
    }
    case "tutorChat": {
      const { atomId, question, history } = body as { atomId: string; question: string; history?: { role: string; text: string }[] };
      const atom = node(db, atomId);
      if (!atom) return bad("Không tìm thấy nguyên tử", 404);
      if (totalSpent(db) >= db.settings.monthlyBudgetUsd) return NextResponse.json({ ok: true, text: "Hôm nay cô đã hết lượt trợ giúp rồi — em hỏi lại sau nhé!" });
      const pkgs = db.packages.filter((p) => p.atomId === atomId);
      const hist = Array.isArray(history) ? history.slice(-6).map((m) => ({ role: String(m.role), text: String(m.text).slice(0, 500) })) : [];
      const res = await tutorAnswer(db, atom, pkgs, String(question || "").slice(0, 500), hist);
      return NextResponse.json({ ok: true, text: res.content });
    }
    case "createProposal": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { kind, targetTitle, description } = body as { kind: "add" | "edit" | "merge" | "split"; targetTitle: string; description: string };
      if (!["add", "edit", "merge", "split"].includes(kind)) return bad("Loại đề xuất không hợp lệ");
      if (!targetTitle?.trim() || !description?.trim()) return bad("Điền đủ thông tin");
      db.proposals.unshift({ id: uid("pr_"), kind, targetTitle: targetTitle.slice(0, 200), description: description.slice(0, 2000), status: "open", by: who, at: nowIso() });
      logActivity(user.name, "đề xuất sửa cây", targetTitle, "/proposals");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "decideProposal": {
      if (!canReview) return bad("Chỉ tổ trưởng/quản trị được quyết", 403);
      const { id, decision, note } = body as { id: string; decision: "accepted" | "rejected"; note?: string };
      if (decision !== "accepted" && decision !== "rejected") return bad("Quyết định không hợp lệ");
      if (decision === "rejected" && !note?.trim()) return bad("Từ chối phải kèm lý do");
      const pr = db.proposals.find((p) => p.id === id);
      if (!pr || pr.status !== "open") return bad("Không tìm thấy đề xuất đang mở", 404);
      pr.status = decision; pr.decidedBy = who; pr.note = (note || "").slice(0, 2000);
      logActivity(user.name, decision === "accepted" ? "chấp nhận đề xuất" : "từ chối đề xuất", pr.targetTitle, "/proposals");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "assetsBulk": {
      // Thao tác hàng loạt trong Kho học liệu: xóa / lưu trữ / bỏ lưu trữ / gán thư mục
      if (!canEdit) return bad("Không có quyền", 403);
      const { action, ids, folder } = body as { action: string; ids: string[]; folder?: string };
      if (!Array.isArray(ids) || !ids.length) return bad("Chưa chọn học liệu nào");
      if (!["delete", "archive", "unarchive", "folder"].includes(action)) return bad("Thao tác không hợp lệ");
      const idSet = new Set(ids.slice(0, 500).map(String));
      const mine = db.assets.filter((a) => idSet.has(a.id) && ownsPkg(db, user, a.packageId)); // teacher/lead chỉ đụng môn mình
      if (!mine.length) return bad("Không có học liệu hợp lệ trong lựa chọn (có thể thuộc môn khác)", 403);
      const fname = String(folder || "").trim().slice(0, 60);
      if (action === "folder" && folder !== undefined && !fname && String(folder).trim() !== "") return bad("Tên thư mục không hợp lệ");
      if (action === "delete") {
        const del = new Set(mine.map((a) => a.id));
        db.assets = db.assets.filter((a) => !del.has(a.id));
      } else {
        for (const a of mine) {
          if (action === "archive") a.archived = true;
          else if (action === "unarchive") delete a.archived;
          else if (action === "folder") { if (fname) a.folder = fname; else delete a.folder; }
        }
      }
      const label = action === "delete" ? "xóa" : action === "archive" ? "lưu trữ" : action === "unarchive" ? "bỏ lưu trữ" : fname ? `chuyển vào thư mục "${fname}"` : "bỏ khỏi thư mục";
      logActivity(user.name, label, `${mine.length} học liệu trong kho`, "/library");
      persist();
      return NextResponse.json({ ok: true, affected: mine.length });
    }
    case "saveSettings": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { settings } = body as { settings: Partial<typeof db.settings> };
      // API key KHÔNG đi qua đường này (client chỉ nhận bản đã che) — chỉ nhận qua op saveAiKey
      delete (settings as Record<string, unknown>).anthropicApiKey;
      // cấu hình tutor cũng vậy — chỉ nhận qua op tutorSaveConfig (client không có bản thô để gửi lại)
      for (const k of ["tutorUrl", "tutorApikey", "tutorEmail", "tutorPassword", "tutorJwt"]) delete (settings as Record<string, unknown>)[k];
      // cấu hình Google cũng chỉ nhận qua op riêng (client không giữ bản thô của secret)
      for (const k of ["googleClientId", "googleClientSecret", "googleDomains"]) delete (settings as Record<string, unknown>)[k];
      db.settings = { ...db.settings, ...settings, monthlyBudgetUsd: Number(settings.monthlyBudgetUsd ?? db.settings.monthlyBudgetUsd) || db.settings.monthlyBudgetUsd };
      logActivity(user.name, "cập nhật", "phong cách chung", "/settings");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "saveAiKey": {
      // Lưu/Xóa kết nối OpenRouter từ UI Cài đặt — có hiệu lực NGAY (không cần restart server)
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { key, model } = body as { key?: string; model?: string };
      if (key !== undefined) {
        const k = String(key).trim();
        if (k && !/^sk-or-/.test(k)) return bad("Key không đúng dạng — dùng key OpenRouter, bắt đầu bằng sk-or-v1-…");
        if (k) db.settings.anthropicApiKey = k; else delete db.settings.anthropicApiKey;
      }
      if (model !== undefined) {
        const m = String(model).trim().slice(0, 60);
        if (m) db.settings.anthropicModel = m; else delete db.settings.anthropicModel;
      }
      logActivity(user.name, db.settings.anthropicApiKey ? "cập nhật" : "gỡ", "kết nối OpenRouter", "/settings?tab=general"); // không log key
      persist();
      const kNow = aiKey(db);
      return NextResponse.json({ ok: true, hasKey: !!kNow, keyTail: kNow ? kNow.slice(-4) : "", model: aiModel(db) });
    }
    case "saveSso": {
      // Khai/gỡ một nhà cung cấp đăng nhập từ UI Cài đặt — có hiệu lực NGAY. Gửi chuỗi rỗng = gỡ.
      // id "google" ghi vào các trường googleClientId/Secret/Domains có sẵn (giữ khuôn cũ, không gãy
      // bản đang chạy); mọi id khác ("hub"…) nằm trong mảng settings.oidcProviders.
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const b = body as { id?: string; label?: string; discoveryUrl?: string; clientId?: string; clientSecret?: string; domains?: string; scope?: string; sessionMinutes?: number };
      const pid = (b.id || "google").trim();
      const clean = (v: string | undefined, max = 200) => v === undefined ? undefined : String(v).trim().slice(0, max);

      const domainList = b.domains === undefined ? undefined
        : String(b.domains).split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
      if (domainList?.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) return bad("Domain không hợp lệ — ví dụ đúng: truongvietanh.com");

      if (pid === "google") {
        const cid = clean(b.clientId);
        if (cid !== undefined) {
          if (cid && !/\.apps\.googleusercontent\.com$/.test(cid)) return bad("Client ID không đúng dạng — phải kết thúc bằng .apps.googleusercontent.com");
          if (cid) db.settings.googleClientId = cid; else delete db.settings.googleClientId;
        }
        const sec = clean(b.clientSecret);
        if (sec !== undefined) { if (sec) db.settings.googleClientSecret = sec; else delete db.settings.googleClientSecret; }
        if (domainList !== undefined) { if (domainList.length) db.settings.googleDomains = domainList.join(", "); else delete db.settings.googleDomains; }
      } else {
        const list = [...(db.settings.oidcProviders ?? [])];
        const i = list.findIndex((x) => x.id === pid);
        const cur = i >= 0 ? list[i] : undefined;
        const cid = clean(b.clientId) ?? cur?.clientId ?? "";
        const sec = clean(b.clientSecret) ?? cur?.clientSecret ?? "";
        if (!cid || !sec) {                       // gỡ hẳn khi thiếu một trong hai
          if (i >= 0) list.splice(i, 1);
        } else {
          const disc = clean(b.discoveryUrl, 300) ?? cur?.discoveryUrl ?? "";
          if (!/^https:\/\//.test(disc)) return bad("Discovery URL phải bắt đầu bằng https://");
          const next = {
            id: pid, label: clean(b.label, 60) || cur?.label || pid,
            discoveryUrl: disc, clientId: cid, clientSecret: sec,
            scope: clean(b.scope, 200) ?? cur?.scope ?? "openid profile",
            domains: domainList ? domainList.join(", ") : cur?.domains ?? "",
            sessionMinutes: Number(b.sessionMinutes ?? cur?.sessionMinutes ?? 15) || 15,
          };
          if (i >= 0) list[i] = next; else list.push(next);
        }
        if (list.length) db.settings.oidcProviders = list; else delete db.settings.oidcProviders;
      }

      clearDiscoveryCache(); // đổi cấu hình là quên bản discovery đang nhớ, khỏi phải khởi động lại
      logActivity(user.name, oidcEnabled(db) ? "bật" : "tắt", `đăng nhập một lần (${pid})`, "/settings?tab=general"); // không log secret
      persist();
      return NextResponse.json({ ok: true, enabled: oidcEnabled(db), providers: providers(db).map((x) => ({ id: x.id, label: x.label, clientId: x.clientId, hasSecret: !!x.clientSecret, domains: x.domains ?? "", discoveryUrl: x.discoveryUrl, source: x.source, sessionMinutes: x.sessionMinutes })) });
    }
    case "saveHubEmbed": {
      // Khai/gỡ cổng gửi sự kiện nghiệp vụ về Hub (Đường B). Gửi chuỗi rỗng = tắt hẳn.
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { secret } = body as { secret?: string };
      if (secret !== undefined) {
        const v = String(secret).trim().slice(0, 200);
        if (v) db.settings.hubEmbedSecret = v; else delete db.settings.hubEmbedSecret;
      }
      logActivity(user.name, hubEventsOn() ? "bật" : "tắt", "gửi sự kiện về Hub", "/settings?tab=general"); // không log secret
      persist();
      return NextResponse.json({ ok: true, enabled: hubEventsOn() });
    }
    case "testAiKey": {
      // Gọi thử OpenRouter 1 lượt tí hon: test key VỪA GÕ (chưa lưu) hoặc key đang có hiệu lực
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { key, model } = body as { key?: string; model?: string };
      const k = String(key || "").trim() || aiKey(db);
      const m = String(model || "").trim() || aiModel(db);
      if (!k) return bad("Chưa có key nào để kiểm tra — dán key vào ô trước");
      const res = await testAiConnection(k, m);
      return NextResponse.json(res);
    }
    // ===== Kết nối app Gia sư (tutor) =====
    case "tutorSaveConfig": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { url, apikey, email, password, jwt } = body as { url?: string; apikey?: string; email?: string; password?: string; jwt?: string };
      const set = (k: "tutorUrl" | "tutorApikey" | "tutorEmail" | "tutorPassword" | "tutorJwt", v?: string, max = 300) => {
        if (v === undefined) return;                       // không gửi = giữ nguyên
        const clean = String(v).trim().slice(0, max);
        if (clean) db.settings[k] = clean; else delete db.settings[k];  // gửi chuỗi rỗng = gỡ
      };
      set("tutorUrl", url); set("tutorApikey", apikey); set("tutorEmail", email, 120);
      set("tutorPassword", password, 120); set("tutorJwt", jwt, 4000);
      clearTutorToken();
      logActivity(user.name, "cập nhật", "kết nối app Gia sư", "/settings?tab=general"); // không log mật khẩu/JWT
      persist();
      return NextResponse.json({ ok: true });
    }
    case "tutorTest": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      return NextResponse.json(await tutorTest(db));
    }
    case "tutorPush": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { ids } = body as { ids: string[] };
      if (!Array.isArray(ids) || !ids.length) return bad("Chưa chọn học liệu nào");
      if (ids.length > 50) return bad("Tối đa 50 học liệu mỗi lần đẩy — chọn ít lại");
      const mine = ids.slice(0, 50).map(String).filter((aid) => {
        const a = db.assets.find((x) => x.id === aid);
        return a && ownsPkg(db, user, a.packageId);        // teacher/lead chỉ đẩy môn mình
      });
      if (!mine.length) return bad("Không có học liệu hợp lệ trong lựa chọn (có thể thuộc môn khác)", 403);
      const out = await pushAssets(db, mine);
      if (out.pushed > 0) { logActivity(user.name, "đẩy sang Gia sư", `${out.pushed}/${out.results.length} học liệu`, "/library"); persist(); }
      return NextResponse.json({ ok: true, ...out });
    }
    case "saveFormatSkill": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { format, skill } = body as { format: AssetFormat; skill: Record<string, unknown> };
      if (!FORMATS.includes(format)) return bad("Định dạng không hợp lệ");
      const s = skill || {};
      const clamp = (v: unknown, n: number) => String(v ?? "").slice(0, n);
      const clean = {
        agent: clamp(s.agent, 80), style: clamp(s.style, 2000), imageStyle: clamp(s.imageStyle, 2000), guide: clamp(s.guide, 3000),
        audience: clamp(s.audience, 500), length: clamp(s.length, 300), constraints: clamp(s.constraints, 2000), sample: clamp(s.sample, 4000),
      };
      db.settings.formatSkills = { ...(db.settings.formatSkills || {}), [format]: clean } as typeof db.settings.formatSkills;
      logActivity(user.name, "cập nhật skill agent", format, "/settings?tab=agents");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "saveVideoPrompt": {
      // Lưu/khôi phục prompt sinh kịch bản video (nguồn chân lý mà generation ĐỌC). Rỗng = dùng VIDEO_PROMPT mặc định.
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { prompt } = body as { prompt?: string };
      const p = String(prompt ?? "").trim().slice(0, 20000);
      if (p) db.settings.videoPrompt = p; else delete db.settings.videoPrompt;
      logActivity(user.name, db.settings.videoPrompt ? "cập nhật" : "khôi phục mặc định", "prompt kịch bản video", "/settings?tab=agents");
      persist();
      return NextResponse.json({ ok: true });
    }
    // ===== Quản lý cây chương trình =====
    case "nodeCreate": {
      if (!isAdmin) return bad("Chỉ quản trị được sửa chương trình", 403);
      const { parentId, kind, title } = body as { parentId: string | null; kind: TreeNode["kind"]; title: string };
      if (typeof title !== "string" || !title.trim()) return bad("Nhập tên");
      if (!KINDS.includes(kind)) return bad("Loại mục không hợp lệ");
      const parent = parentId ? node(db, parentId) : null;
      if (parentId && !parent) return bad("Không tìm thấy mục cha", 404);
      if (PARENT_KIND[kind] !== (parent ? parent.kind : null))
        return bad(`Không thể thêm ${kind} vào ${parent ? parent.kind : "gốc"} — sai tầng`);
      const sibs = db.tree.filter((n) => n.parentId === (parentId || null));
      const order = sibs.reduce((m, n) => Math.max(m, n.order), -1) + 1;                     // max+1, không dùng .length
      const base = parent ? `${parent.code}.${order + 1}` : `M${db.tree.filter((n) => n.kind === "subject").length + 1}`;
      let code = base, i = 1;
      while (db.tree.some((n) => n.code === code)) code = `${base}b${i++}`;                    // đảm bảo mã duy nhất
      const id = kind === "atom" ? newKC(db) : uid(kind[0] + "_");   // atom mới = KC; tầng cấu trúc giữ uid
      db.tree.push({ id, kind, parentId: parentId || null, title: title.slice(0, 200), code, order, refs: [] });
      invalidateTreeIndex();
      logActivity(user.name, "thêm", `${kind} "${title}"`, "/curriculum");
      persist();
      return NextResponse.json({ ok: true, id });
    }
    case "nodeEdit": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id, title } = body as { id: string; title: string };
      const n = node(db, id); if (!n) return bad("Không tìm thấy", 404);
      if (title?.trim()) n.title = title.slice(0, 200);
      persist();
      return NextResponse.json({ ok: true });
    }
    case "nodeDelete": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id } = body as { id: string };
      if (!node(db, id)) return bad("Không tìm thấy", 404);
      const toDel = new Set<string>([id]);
      let changed = true;
      while (changed) { changed = false; for (const n of db.tree) if (n.parentId && toDel.has(n.parentId) && !toDel.has(n.id)) { toDel.add(n.id); changed = true; } }
      const pkgIds = new Set(db.packages.filter((p) => toDel.has(p.atomId)).map((p) => p.id));
      db.packages = db.packages.filter((p) => !toDel.has(p.atomId));
      db.assets = db.assets.filter((a) => !pkgIds.has(a.packageId));
      db.tree = db.tree.filter((n) => !toDel.has(n.id));
      invalidateTreeIndex();
      logActivity(user.name, "xoá", `${toDel.size} mục khỏi cây`, "/curriculum");
      persist();
      return NextResponse.json({ ok: true, removed: toDel.size });
    }
    case "refAdd": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { nodeId, title, url, kind } = body as { nodeId: string; title: string; url: string; kind: import("@/lib/store").Reference["kind"] };
      const n = node(db, nodeId); if (!n) return bad("Không tìm thấy", 404);
      if (n.kind === "atom" && !ownsAtom(db, user, nodeId)) return bad("Nguyên tử thuộc môn khác", 403);
      if (typeof title !== "string" || !title.trim()) return bad("Nhập tên tài liệu");
      const cleanUrl = safeUrl(url);
      if (!cleanUrl) return bad("Đường dẫn không hợp lệ — chỉ nhận liên kết http/https (vd Google Drive, YouTube)");
      const rk = ["drive", "sgk", "link", "video"].includes(kind) ? kind : "link";
      n.refs = [...(n.refs || []), { id: uid("rf_"), title: title.slice(0, 200), url: cleanUrl.slice(0, 600), kind: rk }];
      logActivity(user.name, "gắn tài liệu", title, `/atom/${nodeId}`);
      persist();
      return NextResponse.json({ ok: true });
    }
    case "refRemove": {
      if (!canEdit) return bad("Không có quyền", 403);
      const { nodeId, refId } = body as { nodeId: string; refId: string };
      const n = node(db, nodeId); if (!n) return bad("Không tìm thấy", 404);
      n.refs = (n.refs || []).filter((r) => r.id !== refId);
      persist();
      return NextResponse.json({ ok: true });
    }
    // ===== Quản trị người dùng =====
    case "userCreate": {
      if (!isAdmin) return bad("Chỉ quản trị được tạo tài khoản", 403);
      const { name, role, subject, id, email, password } = body as { name: string; role: import("@/lib/store").Role; subject?: string; id?: string; email?: string; password?: string };
      if (typeof name !== "string" || !name.trim()) return bad("Nhập tên");
      if (!ROLES.includes(role)) return bad("Vai trò không hợp lệ");
      const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "").replace(/^\.+|\.+$/g, "");
      let uidStr = (id?.trim() ? slug(id) : slug(name)).slice(0, 40);
      if (!uidStr) return bad("Không tạo được mã đăng nhập từ tên — hãy nhập Mã đăng nhập thủ công");
      if (db.users.some((u) => u.id === uidStr)) { let i = 2; while (db.users.some((u) => u.id === `${uidStr}${i}`)) i++; uidStr = `${uidStr}${i}`; }
      const title = role === "teacher" ? `Giáo viên${subject ? " " + subject : ""}` : role === "lead" ? `Tổ trưởng${subject ? " " + subject : ""}` : role === "admin" ? "Quản trị học thuật" : "Ban giám hiệu";
      db.users.push({ id: uidStr, name: name.slice(0, 80), role, subject: subject?.slice(0, 40), title, email: email?.trim().slice(0, 120) || undefined, password: password?.trim() ? hashPw(password.trim(), db.secret) : undefined });
      logActivity(user.name, "tạo tài khoản", name, "/users");
      persist();
      return NextResponse.json({ ok: true, id: uidStr });
    }
    case "userUpdate": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id, name, role, subject, email, password } = body as { id: string; name?: string; role?: import("@/lib/store").Role; subject?: string; email?: string; password?: string };
      const u = db.users.find((x) => x.id === id); if (!u) return bad("Không tìm thấy", 404);
      // chống hạ cấp admin cuối cùng (khoá toàn bộ quản trị)
      if (role && role !== "admin" && u.role === "admin" && db.users.filter((x) => x.role === "admin").length <= 1) return bad("Phải còn ít nhất một quản trị — không thể hạ cấp admin cuối cùng");
      if (typeof name === "string" && name.trim()) u.name = name.slice(0, 80);
      if (subject !== undefined) u.subject = String(subject).slice(0, 40) || undefined;
      if (email !== undefined) u.email = String(email).trim().slice(0, 120) || undefined;
      if (typeof password === "string" && password.trim()) u.password = hashPw(password.trim(), db.secret);
      if (role && ROLES.includes(role)) { u.role = role; u.title = role === "teacher" ? `Giáo viên${u.subject ? " " + u.subject : ""}` : role === "lead" ? `Tổ trưởng${u.subject ? " " + u.subject : ""}` : role === "admin" ? "Quản trị học thuật" : "Ban giám hiệu"; }
      logActivity(user.name, "cập nhật tài khoản", u.name, "/users");
      persist();
      return NextResponse.json({ ok: true });
    }
    case "userDelete": {
      if (!isAdmin) return bad("Chỉ quản trị", 403);
      const { id } = body as { id: string };
      if (id === user.id) return bad("Không thể xoá chính mình");
      if (db.users.filter((u) => u.role === "admin").length <= 1 && db.users.find((u) => u.id === id)?.role === "admin") return bad("Phải còn ít nhất một quản trị");
      db.users = db.users.filter((u) => u.id !== id);
      logActivity(user.name, "xoá tài khoản", id, "/users");
      persist();
      return NextResponse.json({ ok: true });
    }
    default:
      return bad("op không hợp lệ: " + op);
  }
  } catch (e) {
    return bad("Lỗi máy chủ: " + (e instanceof Error ? e.message : String(e)), 500);
  }
}
