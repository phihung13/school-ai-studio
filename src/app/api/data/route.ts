import { NextRequest, NextResponse } from "next/server";
import {
  getDB, node, children, ancestors, atomsOfSubject, atomsUnder, pkgOf, chapterOf, subtreeOutline, nowIso, subjectOf,
  DB, Pkg, TreeNode, AssetFormat,
} from "@/lib/store";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { instructionPack, hasAiKey, aiModel, aiKeySource, aiKey } from "@/lib/ai";
import { tutorConfig, tutorConfigured } from "@/lib/tutor-push";
import { backchannelLogoutUrl, callbackUrl, oidcEnabled, originOf, providers } from "@/lib/oidc";
import { hubEventsOn } from "@/lib/hub-events";
import { flashcardsForAtom } from "@/lib/flashcards";
import { dueOf } from "@/lib/srs";

export const dynamic = "force-dynamic";

const FORMATS: AssetFormat[] = ["text", "worksheet", "slide", "quiz", "mindmap", "flashcard", "podcast", "video"];

function atomCoverage(db: DB, atomId: string) {
  const levels = [1, 2, 3].map((lv) => {
    const p = pkgOf(db, atomId, lv);
    return p ? p.status : null;
  });
  const assetCount = db.assets.filter((a) => db.packages.some((p) => p.id === a.packageId && p.atomId === atomId) && a.status === "ready").length;
  return { levels, assetCount };
}

function subjectStats(db: DB, subjectId: string) {
  const atoms = atomsOfSubject(db, subjectId);
  const totalPkgs = atoms.length * 3;
  const pkgs = db.packages.filter((p) => atoms.some((a) => a.id === p.atomId));
  const by = (s: Pkg["status"]) => pkgs.filter((p) => p.status === s).length;
  const assets = db.assets.filter((a) => pkgs.some((p) => p.id === a.packageId));
  const drafted = Math.min(pkgs.length, totalPkgs);
  return {
    atomCount: atoms.length, totalPkgs, drafted,
    draft_ai: by("draft_ai"), edited: by("edited"), pending: by("pending_review"), approved: by("approved"),
    assetsReady: assets.filter((a) => a.status === "ready").length,
    assetsOutdated: assets.filter((a) => a.status === "outdated").length,
    coveragePct: totalPkgs ? Math.min(100, Math.round((by("approved") / totalPkgs) * 100)) : 0,
    draftPct: totalPkgs ? Math.min(100, Math.round((drafted / totalPkgs) * 100)) : 0,
  };
}

export async function GET(req: NextRequest) {
  const db = getDB();
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  const view = req.nextUrl.searchParams.get("view") || "";
  const id = req.nextUrl.searchParams.get("id") || "";

  // "me" là view DUY NHẤT không cần đăng nhập — trang login hỏi luôn ở đây xem có bật nút Google không
  // Trang đăng nhập hỏi ở đây: có những lối đăng nhập nào, và có nên thử gia hạn im lặng không.
  if (view === "me") {
    return NextResponse.json({
      user,
      sso: providers(db).map((p) => ({ id: p.id, label: p.label })),
    });
  }
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Cổng quyền đọc theo view (đối xứng với chốt quyền ghi ở /api/action)
  const gate: Record<string, string[]> = {
    settings: ["admin"],
    dashboard: ["admin", "principal", "lead"],
    review: ["lead", "admin"],
    batch: ["admin"],
    jobs: ["admin"],
    curriculum: ["admin"],
    users: ["admin"],
    formatSkills: ["admin"],
    importStats: ["admin"],
  };
  if (gate[view] && !gate[view].includes(user.role)) return NextResponse.json({ error: "Không có quyền xem mục này" }, { status: 403 });

  switch (view) {
    case "home": {
      const subjects = db.tree.filter((n) => n.kind === "subject").map((s) => ({ ...s, stats: subjectStats(db, s.id) }));
      const pendingCount = db.packages.filter((p) => p.status === "pending_review").length;
      const outdated = db.assets.filter((a) => a.status === "outdated").length;
      const spentUsd = +(db.assets.reduce((s, a) => s + a.costUsd, 0) + db.jobs.reduce((s, j) => s + j.costUsd, 0)).toFixed(2);
      return NextResponse.json({ user, subjects, pendingCount, outdated, spentUsd, budget: db.settings.monthlyBudgetUsd, activity: db.activity.slice(0, 12), openProposals: db.proposals.filter((p) => p.status === "open").length });
    }
    case "tree": {
      // Danh sách Môn, mỗi Môn kèm các Lớp con → đủ để dựng cả 2 cửa "theo Môn" và "theo Lớp".
      const mons = db.tree.filter((n) => n.kind === "subject").map((s) => ({
        id: s.id, title: s.title, code: s.code,
        grades: children(db, s.id).filter((g) => g.kind === "grade").map((g) => ({ id: g.id, title: g.title, grade: g.grade ?? null })),
      }));
      // rootId = một node Lớp (ô Môn×Lớp). id truyền vào có thể là Lớp, Môn, hoặc rỗng.
      const picked = id ? node(db, id) : undefined;
      let rootId = "";
      if (picked?.kind === "grade") rootId = picked.id;
      else if (picked?.kind === "subject") rootId = children(db, picked.id).find((g) => g.kind === "grade")?.id || "";
      if (!rootId) rootId = db.tree.find((n) => n.kind === "grade")?.id || "";
      const subjectId = rootId ? (ancestors(db, rootId).find((a) => a.kind === "subject")?.id || "") : "";
      // các node dưới ô đã chọn: DFS từ rootId (O(n) thay vì ancestors O(n²))
      const nodes: TreeNode[] = [];
      const walkTree = (pid: string) => { for (const c of children(db, pid)) { nodes.push(c); walkTree(c.id); } };
      if (rootId) walkTree(rootId);
      const coverage: Record<string, ReturnType<typeof atomCoverage>> = {};
      for (const n of nodes) if (n.kind === "atom") coverage[n.id] = atomCoverage(db, n.id);
      return NextResponse.json({ mons, rootId, subjectId, nodes, coverage, stats: subjectStats(db, rootId) });
    }
    case "graph": {
      // Chỉ mục cây O(1) + đi ngược 1 lần lấy chương/bài/lớp/môn cho mỗi atom (tránh ancestors O(n²)).
      const gidx = new Map(db.tree.map((n) => [n.id, n]));
      const chain = (aid: string) => {
        let cur = gidx.get(aid); let ch: TreeNode | undefined, le: TreeNode | undefined, gr: TreeNode | undefined, su: TreeNode | undefined, guard = 0;
        while (cur && guard++ < 12) { if (cur.kind === "chapter") ch = cur; else if (cur.kind === "lesson") le = cur; else if (cur.kind === "grade") gr = cur; else if (cur.kind === "subject") su = cur; cur = cur.parentId ? gidx.get(cur.parentId) : undefined; }
        return { ch, le, gr, su };
      };
      const mkAtom = (a: TreeNode, isIn: boolean) => { const c = chain(a.id); return { id: a.id, code: a.code, title: a.title, atomType: a.atomType ?? null, dok: a.dok ?? null, bloom: a.bloom ?? null, nangLuc: a.nangLuc ?? null, yeuCau: a.yeuCau ?? null, verified: !!a.verified, ch: c.ch?.order ?? 0, chTitle: c.ch?.title ?? "", lessonId: c.le?.id ?? "", lessonTitle: c.le?.title ?? "", subject: c.su?.title ?? "", subjectId: c.su?.id ?? "", grade: c.gr?.grade ?? null, inScope: isIn }; };
      const focus = id ? gidx.get(id) : undefined;
      // KHÔNG có node cụ thể → mở TOÀN CẢNH mọi môn/lớp (không tự nhảy vào một lớp).
      if (!focus) {
        const atoms = db.tree.filter((n) => n.kind === "atom");
        return NextResponse.json({ nodes: atoms.map((a) => mkAtom(a, true)), edges: db.edges, rootTitle: "Tất cả môn", scope: "all" });
      }
      const subj = chain(focus.id).su || (focus.kind === "subject" ? focus : undefined);
      const inScope = focus.kind === "atom" ? [focus] : atomsUnder(db, focus.id);
      const inIds = new Set(inScope.map((a) => a.id));
      const touch = db.edges.filter((e) => inIds.has(e.from) || inIds.has(e.to));
      const extIds = new Set<string>();
      for (const e of touch) { if (!inIds.has(e.from)) extIds.add(e.from); if (!inIds.has(e.to)) extIds.add(e.to); }
      const allIds = new Set<string>([...inIds, ...extIds]);
      const gEdges = touch.filter((e) => allIds.has(e.from) && allIds.has(e.to));
      const gnodes = [...inScope.map((a) => mkAtom(a, true)), ...[...extIds].map((x) => gidx.get(x)).filter((x): x is TreeNode => !!x && x.kind === "atom").map((a) => mkAtom(a, false))];
      const rootTitle = `${subj?.title || ""}${focus.kind !== "subject" ? " > " + focus.title : ""}`.trim();
      return NextResponse.json({ nodes: gnodes, edges: gEdges, rootTitle });
    }
    case "map": {
      // Bản đồ độ phủ 3 màu (rừng tổng quan): mỗi ô (Môn × Lớp) tô đỏ/cam/xanh.
      // O(n): dựng chỉ mục con MỘT lần, gom atom-id theo từng grade bằng DFS (tránh ancestors() O(n²)).
      const byParent = new Map<string | null, typeof db.tree>();
      for (const n of db.tree) { const arr = byParent.get(n.parentId); if (arr) arr.push(n); else byParent.set(n.parentId, [n]); }
      const verById = new Set(db.tree.filter((n) => n.kind === "atom" && n.verified).map((n) => n.id));
      // Câu hỏi (Trạm 3) + thang Socratic (Trạm 4) theo nguyên tử — để ô heatmap nói được cả hai trạm này.
      const qN = new Map<string, number>(); for (const q of db.questions) qN.set(q.atomId, (qN.get(q.atomId) ?? 0) + 1);
      const lN = new Map<string, number>(); for (const l of db.ladders ?? []) lN.set(l.atomId, (lN.get(l.atomId) ?? 0) + 1);
      const gradeCover = (gid: string) => {
        const ids = new Set<string>();
        const stack = [gid];
        while (stack.length) { const cur = stack.pop()!; for (const c of byParent.get(cur) ?? []) { if (c.kind === "atom") ids.add(c.id); else stack.push(c.id); } }
        if (!ids.size) return { cover: "empty", atoms: 0, edges: 0, verified: 0, questions: 0, ladders: 0, atomsWithQ: 0, atomsWithL: 0 };
        let edges = 0; for (const e of db.edges) if (ids.has(e.from) && ids.has(e.to)) edges++;
        let verified = 0, questions = 0, ladders = 0, atomsWithQ = 0, atomsWithL = 0;
        for (const id of ids) {
          if (verById.has(id)) verified++;
          const q = qN.get(id); if (q) { questions += q; atomsWithQ++; }
          const l = lN.get(id); if (l) { ladders += l; atomsWithL++; }
        }
        return { cover: edges > 0 ? "full" : "partial", atoms: ids.size, edges, verified, questions, ladders, atomsWithQ, atomsWithL };
      };
      const subjects = (byParent.get(null) ?? []).filter((n) => n.kind === "subject").map((s) => {
        const grades = children(db, s.id).filter((g) => g.kind === "grade").map((g) => ({ id: g.id, grade: g.grade ?? null, ...gradeCover(g.id) }));
        const atoms = grades.reduce((x, g) => x + g.atoms, 0), edges = grades.reduce((x, g) => x + g.edges, 0);
        const questions = grades.reduce((x, g) => x + g.questions, 0), ladders = grades.reduce((x, g) => x + g.ladders, 0);
        const cover = atoms === 0 ? "empty" : grades.some((g) => g.cover === "full") ? "partial" : "partial";
        return { id: s.id, title: s.title, grades, atoms, edges, questions, ladders, cover: atoms === 0 ? "empty" : cover };
      });
      const gradeCols = [...new Set(subjects.flatMap((s) => s.grades.map((g) => g.grade).filter((x): x is number => x != null)))].sort((a, b) => a - b);
      const totals = {
        subjects: subjects.length,
        withData: subjects.filter((s) => s.atoms > 0).length,
        atoms: subjects.reduce((x, s) => x + s.atoms, 0),
        questions: subjects.reduce((x, s) => x + s.questions, 0),
        ladders: subjects.reduce((x, s) => x + s.ladders, 0),
        edges: subjects.reduce((x, s) => x + s.edges, 0),
        cells: subjects.flatMap((s) => s.grades),
        greenCells: subjects.flatMap((s) => s.grades).filter((g) => g.cover === "full").length,
      };
      return NextResponse.json({ subjects, gradeCols, totals });
    }
    case "treemap": {
      // Cây phẳng cho sơ đồ drill-down: mỗi node kèm số nguyên tử bên trong + độ phủ (đủ/thiếu/chưa) để tô màu.
      const rank: Record<string, number> = { approved: 4, pending_review: 3, edited: 2, draft_ai: 1 };
      const atomStatus: Record<string, string> = {}; const atomApproved: Record<string, boolean> = {};
      for (const p of db.packages) { if (!atomStatus[p.atomId] || rank[p.status] > rank[atomStatus[p.atomId]]) atomStatus[p.atomId] = p.status; if (p.status === "approved") atomApproved[p.atomId] = true; }
      const anyPkg: Record<string, boolean> = {}; for (const p of db.packages) anyPkg[p.atomId] = true;
      // bottom-up: đếm atoms + cover cho mỗi node O(n)
      const atomCount: Record<string, number> = {};
      const approvedCount: Record<string, number> = {};
      const hasPkg: Record<string, boolean> = {};
      // pass 1: atoms
      for (const n of db.tree) {
        if (n.kind === "atom") { atomCount[n.id] = 1; approvedCount[n.id] = atomApproved[n.id] ? 1 : 0; hasPkg[n.id] = !!anyPkg[n.id]; }
        else { atomCount[n.id] = 0; approvedCount[n.id] = 0; hasPkg[n.id] = false; }
      }
      // pass 2: bubble up (children → parent); iterate reverse so deeper nodes processed first works for most insertion orders, but safer to iterate parents after children
      const byParent = new Map<string | null, string[]>();
      for (const n of db.tree) { const arr = byParent.get(n.parentId); if (arr) arr.push(n.id); else byParent.set(n.parentId, [n.id]); }
      const sumUp = (nid: string) => { for (const cid of byParent.get(nid) ?? []) { sumUp(cid); atomCount[nid] += atomCount[cid]; approvedCount[nid] += approvedCount[cid]; if (hasPkg[cid]) hasPkg[nid] = true; } };
      for (const n of db.tree) if (n.kind === "subject") sumUp(n.id);
      const coverOf = (nid: string): "empty" | "partial" | "full" => {
        const a = atomCount[nid]; if (!a) return "empty";
        if (approvedCount[nid] === a) return "full";
        if (approvedCount[nid] > 0 || hasPkg[nid]) return "partial";
        return "empty";
      };
      const nodes = db.tree.map((n) => ({
        id: n.id, kind: n.kind, parentId: n.parentId, title: n.title, code: n.code, order: n.order,
        atomType: n.atomType ?? null, verified: !!n.verified,
        atomCount: atomCount[n.id], cover: coverOf(n.id), status: n.kind === "atom" ? (atomStatus[n.id] ?? null) : null,
      }));
      return NextResponse.json({ nodes });
    }
    case "atom": {
      const atom = node(db, id);
      if (!atom || atom.kind !== "atom") return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
      const anc = ancestors(db, id);
      const pkgs = [1, 2, 3].map((lv) => pkgOf(db, id, lv) || null);
      const assets = db.assets.filter((a) => pkgs.some((p) => p && p.id === a.packageId));
      const siblings = children(db, atom.parentId!).filter((n) => n.kind === "atom");
      // gộp tài liệu tham khảo của nguyên tử + các mục cha (kế thừa)
      const refs = [...anc, atom].flatMap((n) => (n.refs || []).map((r) => ({ ...r, from: n.title })));
      const chapter = chapterOf(db, id);
      const outline = chapter ? subtreeOutline(db, chapter.id) : undefined;
      const questions = db.questions.filter((q) => q.atomId === id);
      const ladders = (db.ladders ?? []).filter((l) => l.atomId === id);
      return NextResponse.json({ atom, ancestors: anc, packages: pkgs, assets, formats: FORMATS, siblings, refs, outlineRoot: chapter?.title, outline, questions, ladders });
    }
    case "package": {
      const pkg = db.packages.find((p) => p.id === id);
      if (!pkg) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
      const atom = node(db, pkg.atomId)!;
      const assets = db.assets.filter((a) => a.packageId === pkg.id);
      return NextResponse.json({ pkg, atom, ancestors: ancestors(db, atom.id), assets, reviews: db.reviews.filter((r) => r.packageId === pkg.id) });
    }
    case "asset": {
      const asset = db.assets.find((a) => a.id === id);
      if (!asset) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
      const pkg = db.packages.find((p) => p.id === asset.packageId)!;
      const atom = node(db, pkg.atomId)!;
      return NextResponse.json({ asset, pkg, atom, ancestors: ancestors(db, atom.id) });
    }
    case "review": {
      // Tổ trưởng chỉ thấy gói CỦA TỔ MÌNH (khớp môn); quản trị thấy tất cả. Người không có quyền duyệt → rỗng.
      const canReview = user.role === "lead" || user.role === "admin";
      const inMyTeam = (atomId: string) => {
        if (user.role === "admin" || !user.subject) return true;
        const s = subjectOf(db, atomId);
        return !!s && s.title.toLowerCase().includes(user.subject.toLowerCase());
      };
      const pending = db.packages
        .filter((p) => p.status === "pending_review" && canReview && inMyTeam(p.atomId))
        .map((p) => ({ pkg: p, atom: node(db, p.atomId), chain: ancestors(db, p.atomId).map((n) => n.title).join(" › ") }));
      const history = db.reviews
        .filter((r) => { const p = db.packages.find((x) => x.id === r.packageId); return !p || inMyTeam(p.atomId); })
        .slice(0, 20);
      return NextResponse.json({ pending, history, canReview, subject: user.subject || null });
    }
    // Số gói chờ duyệt CỦA TỔ — cho badge trên menu (nhẹ, gọi lặp được).
    case "reviewCount": {
      if (user.role !== "lead" && user.role !== "admin") return NextResponse.json({ count: 0 });
      const inMyTeam = (atomId: string) => {
        if (user.role === "admin" || !user.subject) return true;
        const s = subjectOf(db, atomId);
        return !!s && s.title.toLowerCase().includes(user.subject.toLowerCase());
      };
      const count = db.packages.filter((p) => p.status === "pending_review" && inMyTeam(p.atomId)).length;
      return NextResponse.json({ count });
    }
    case "jobs":
      return NextResponse.json({ jobs: db.jobs.slice(0, 20) });
    case "batch": {
      const subjects = db.tree.filter((n) => n.kind === "subject").map((s) => ({ ...s, stats: subjectStats(db, s.id) }));
      const spentUsd = +(db.assets.reduce((s, a) => s + a.costUsd, 0) + db.jobs.reduce((s, j) => s + j.costUsd, 0)).toFixed(2);
      return NextResponse.json({ subjects, jobs: db.jobs.slice(0, 20), formats: FORMATS, budget: db.settings.monthlyBudgetUsd, spentUsd });
    }
    case "dashboard": {
      // Câu hỏi (Trạm 3) và thang Socratic (Trạm 4) đếm theo nguyên tử — trước đây dashboard KHÔNG đếm
      // hai thứ này nên nạp kho về bao nhiêu cũng không thấy số nào nhích.
      const qByAtom = new Map<string, number>();
      for (const q of db.questions) qByAtom.set(q.atomId, (qByAtom.get(q.atomId) ?? 0) + 1);
      const lByAtom = new Map<string, number>();
      for (const l of db.ladders ?? []) lByAtom.set(l.atomId, (lByAtom.get(l.atomId) ?? 0) + 1);
      const subjects = db.tree.filter((n) => n.kind === "subject").map((s) => {
        // Con trực tiếp của Môn giờ là các Lớp → bảng chi tiết theo Lớp.
        const grades = children(db, s.id).filter((g) => g.kind === "grade");
        const chapters = grades.map((g) => {
          const walkAtoms = (pid: string): TreeNode[] => children(db, pid).flatMap((n) => n.kind === "atom" ? [n] : walkAtoms(n.id));
          const gAtoms = walkAtoms(g.id);
          const pkgs = db.packages.filter((p) => gAtoms.some((a) => a.id === p.atomId));
          return {
            id: g.id, title: g.title, atomCount: gAtoms.length,
            approved: pkgs.filter((p) => p.status === "approved").length,
            pending: pkgs.filter((p) => p.status === "pending_review").length,
            drafted: pkgs.length, total: gAtoms.length * 3,
            questionCount: gAtoms.reduce((n, a) => n + (qByAtom.get(a.id) ?? 0), 0),
            ladderCount: gAtoms.reduce((n, a) => n + (lByAtom.get(a.id) ?? 0), 0),
            atomsWithQ: gAtoms.filter((a) => qByAtom.has(a.id)).length,
            atomsWithL: gAtoms.filter((a) => lByAtom.has(a.id)).length,
          };
        });
        return { ...s, stats: subjectStats(db, s.id), chapters };
      });
      const assets = db.assets;
      const byFormat = FORMATS.map((f) => ({ format: f, ready: assets.filter((a) => a.format === f && a.status === "ready").length, outdated: assets.filter((a) => a.format === f && a.status === "outdated").length }));
      const tokens = assets.reduce((s, a) => s + a.tokens, 0) + db.jobs.reduce((s, j) => s + j.tokens, 0);
      const spentUsd = +(assets.reduce((s, a) => s + a.costUsd, 0) + db.jobs.reduce((s, j) => s + j.costUsd, 0)).toFixed(2);
      return NextResponse.json({ subjects, byFormat, tokens, spentUsd, budget: db.settings.monthlyBudgetUsd, activity: db.activity.slice(0, 25), reviews: db.reviews.length, jobs: db.jobs.length, questionCount: db.questions.length, ladderCount: (db.ladders ?? []).length, atomsWithQ: qByAtom.size, atomsWithL: lByAtom.size });
    }
    case "library": {
      const q = (req.nextUrl.searchParams.get("q") || "").toLowerCase();
      const fmt = req.nextUrl.searchParams.get("format") || "";
      const folder = req.nextUrl.searchParams.get("folder") || "";
      const showArchived = req.nextUrl.searchParams.get("archived") === "1";
      const folders = [...new Set(db.assets.map((a) => a.folder).filter(Boolean))].sort() as string[];
      const items = db.assets
        .filter((a) => (showArchived ? a.archived === true : !a.archived) && (!folder || a.folder === folder))
        .map((a) => {
          const pkg = db.packages.find((p) => p.id === a.packageId)!;
          const atom = node(db, pkg.atomId)!;
          const { content: _c, ...lite } = a; void _c; // kho chỉ cần metadata — bỏ content cho nhẹ
          return { asset: lite, pkg, atom, chain: ancestors(db, atom.id).map((n) => n.title).join(" › ") };
        })
        .filter((x) => (!fmt || x.asset.format === fmt) && (!q || x.atom.title.toLowerCase().includes(q) || x.atom.code.toLowerCase().includes(q) || x.chain.toLowerCase().includes(q)))
        .sort((a, b) => b.asset.createdAt.localeCompare(a.asset.createdAt));
      return NextResponse.json({ items: items.slice(0, 100), formats: FORMATS, folders, archivedCount: db.assets.filter((a) => a.archived).length });
    }
    case "proposals":
      return NextResponse.json({ proposals: db.proposals });
    case "tutorTree": {
      const subjects = db.tree.filter((n) => n.kind === "subject");
      const atoms = db.tree.filter((n) => n.kind === "atom").map((a) => {
        const pkgs = db.packages.filter((p) => p.atomId === a.id);
        return { ...a, chain: ancestors(db, a.id).map((n) => n.title).join(" › "), approved: pkgs.filter((p) => p.status === "approved").length, any: pkgs.length };
      }).filter((a) => a.any > 0);
      return NextResponse.json({ subjects, atoms });
    }
    case "tutor": {
      const atom = node(db, id);
      if (!atom) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
      const pkgs = db.packages.filter((p) => p.atomId === id).sort((a, b) => a.level - b.level);
      const assets = db.assets.filter((a) => pkgs.some((p) => p.id === a.packageId) && (a.status === "ready" || a.status === "outdated"));
      return NextResponse.json({ atom, chain: ancestors(db, id).map((n) => n.title).join(" › "), packages: pkgs, assets });
    }
    case "flashcards": {
      // Thẻ ghi nhớ (Ôn tập FSRS): sinh thẳng từ atom + đồ thị, không cần gói/AI — mỗi thẻ kèm lịch ôn của user hiện tại.
      const atom = node(db, id);
      if (!atom || atom.kind !== "atom") return NextResponse.json({ error: "Không tìm thấy nguyên tử" }, { status: 404 });
      const cards = flashcardsForAtom(db, atom).map((c) => ({ ...c, due: dueOf(db, user.id, atom.id, c.idx) }));
      const now = nowIso();
      return NextResponse.json({ atomId: atom.id, cards, dueCount: cards.filter((c) => c.due <= now).length, now });
    }
    case "settings": {
      const sampleAtom = db.tree.find((n) => n.kind === "atom")!;
      // KHÔNG BAO GIỜ trả key/mật khẩu thô về client — chỉ trạng thái + vài ký tự nhận diện
      const { anthropicApiKey: _k, tutorPassword: _tp, tutorJwt: _tj, googleClientSecret: _gs, hubEmbedSecret: _hs, oidcProviders: _op, ...safeSettings } = db.settings;
      void _k; void _tp; void _tj; void _gs; void _hs; void _op;
      const plist = providers(db);
      const k = aiKey(db);
      const tcfg = tutorConfig(db);
      // keyTail (4 ký tự cuối) CHỈ cho quản trị — người khác dùng được AI nhưng KHÔNG xem key (kể cả phần đuôi).
      const isAdmin = user.role === "admin";
      return NextResponse.json({
        settings: safeSettings, packPreview: instructionPack(db, sampleAtom, 2),
        hasKey: hasAiKey(db), model: aiModel(db), keySource: aiKeySource(db), keyTail: k && isAdmin ? k.slice(-4) : "",
        tutor: { url: tcfg.url, email: tcfg.email || "", configured: tutorConfigured(db), hasPassword: !!db.settings.tutorPassword, hasJwt: !!db.settings.tutorJwt },
        // Đăng nhập một lần: client secret KHÔNG trả thô, chỉ báo đã có hay chưa.
        // callbackUrl + backchannelLogoutUrl là hai địa chỉ phải nộp cho nhà cung cấp khi đăng ký app.
        sso: {
          enabled: oidcEnabled(db), callbackUrl: callbackUrl(originOf(req)), backchannelLogoutUrl: backchannelLogoutUrl(originOf(req)),
          providers: plist.map((p) => ({
            id: p.id, label: p.label, clientId: p.clientId, hasSecret: !!p.clientSecret,
            domains: p.domains ?? "", discoveryUrl: p.discoveryUrl, source: p.source, sessionMinutes: p.sessionMinutes ?? 0,
          })),
          // Đường B: cổng gửi sự kiện nghiệp vụ về Hub — chỉ báo bật/tắt, không trả secret
          hubEvents: hubEventsOn(),
        },
      });
    }
    case "preflight": {
      // "Đủ điều kiện sản xuất" TRƯỚC khi thêm vào đơn — cùng luật với runner:
      // sinh học liệu cần GÓI ĐÚNG MỨC; đã có bản ready thì bỏ qua; nháp không đè gói Chuẩn trường.
      const nid = req.nextUrl.searchParams.get("id") || "";
      const kind = req.nextUrl.searchParams.get("kind") === "asset" ? "asset" : "draft";
      const levels = (req.nextUrl.searchParams.get("levels") || "").split(",").map(Number).filter((x) => [1, 2, 3].includes(x));
      const formats = (req.nextUrl.searchParams.get("formats") || "").split(",").filter((f) => FORMATS.includes(f as AssetFormat)) as AssetFormat[];
      const root = node(db, nid);
      if (!root || !levels.length) return NextResponse.json({ error: "Thiếu phạm vi hoặc mức" }, { status: 400 });
      const atoms = root.kind === "atom" ? [root] : atomsUnder(db, nid);
      const pkgAt = new Map<string, { approved: boolean; id: string }>();
      for (const p of db.packages) pkgAt.set(`${p.atomId}|${p.level}`, { approved: p.status === "approved", id: p.id });
      const ready = new Set<string>();
      for (const a of db.assets) if (a.status === "ready" && !a.archived) ready.add(`${a.packageId}|${a.format}`);
      if (kind === "draft") {
        let fresh = 0, redraft = 0, keep = 0;
        for (const at of atoms) for (const lv of levels) {
          const p = pkgAt.get(`${at.id}|${lv}`);
          if (!p) fresh++; else if (p.approved) keep++; else redraft++;
        }
        return NextResponse.json({ kind, atoms: atoms.length, total: atoms.length * levels.length, willRun: fresh + redraft, fresh, redraft, keep });
      }
      let willRun = 0, noPkg = 0, existing = 0;
      for (const at of atoms) for (const lv of levels) {
        const p = pkgAt.get(`${at.id}|${lv}`);
        for (const f of formats) {
          if (!p) noPkg++;
          else if (ready.has(`${p.id}|${f}`)) existing++;
          else willRun++;
        }
      }
      return NextResponse.json({ kind, atoms: atoms.length, total: atoms.length * levels.length * Math.max(formats.length, 1), willRun, noPkg, existing });
    }
    case "prodCoverage": {
      // Bản đồ SẢN XUẤT cho cây một môn: mỗi node = {a: tổng nguyên tử, p: đã có gói, s: đã có học liệu}
      // → UI vẽ ✓ (đủ) / ◐ (đang dở) / ✗ (chưa làm) ngay trên cây chọn phạm vi của Xưởng.
      const sid = req.nextUrl.searchParams.get("id") || "";
      const root = node(db, sid);
      if (!root) return NextResponse.json({ error: "Không tìm thấy môn" }, { status: 404 });
      const hasPkg = new Set(db.packages.map((p) => p.atomId));
      const pkgById = new Map(db.packages.map((p) => [p.id, p]));
      const hasAsset = new Set<string>();
      for (const a of db.assets) { if (a.archived) continue; const p = pkgById.get(a.packageId); if (p) hasAsset.add(p.atomId); }
      const cov: Record<string, { a: number; p: number; s: number }> = {};
      const walk = (n: TreeNode): { a: number; p: number; s: number } => {
        if (n.kind === "atom") {
          const e = { a: 1, p: hasPkg.has(n.id) ? 1 : 0, s: hasAsset.has(n.id) ? 1 : 0 };
          cov[n.id] = e; return e;
        }
        const agg = { a: 0, p: 0, s: 0 };
        for (const k of children(db, n.id)) { const e = walk(k); agg.a += e.a; agg.p += e.p; agg.s += e.s; }
        cov[n.id] = agg; return agg;
      };
      walk(root);
      return NextResponse.json({ cov });
    }
    case "formatSkills": {
      return NextResponse.json({ formats: FORMATS, skills: db.settings.formatSkills || {}, hasKey: hasAiKey(db), videoPrompt: db.settings.videoPrompt || "" });
    }
    case "importStats": {
      return NextResponse.json({
        atoms: db.tree.filter((n) => n.kind === "atom").length,
        edges: db.edges.length,
        outdated: db.assets.filter((a) => a.status === "outdated").length,
        subjects: db.tree.filter((n) => n.kind === "subject").length,
      });
    }
    case "users": {
      const counts = { teacher: 0, lead: 0, admin: 0, principal: 0 } as Record<string, number>;
      for (const u of db.users) counts[u.role]++;
      return NextResponse.json({ users: db.users, counts, subjects: db.tree.filter((n) => n.kind === "subject").map((s) => s.title) });
    }
    case "curriculum": {
      const subjectId = id || db.tree.find((n) => n.kind === "subject")?.id || "";
      const subjects = db.tree.filter((n) => n.kind === "subject");
      const nodes: TreeNode[] = subjectId ? [node(db, subjectId)!].filter(Boolean) : [];
      const walkCur = (pid: string) => { for (const c of children(db, pid)) { nodes.push(c); walkCur(c.id); } };
      if (subjectId) walkCur(subjectId);
      const pkgByAtom = new Map<string, number>();
      for (const p of db.packages) pkgByAtom.set(p.atomId, (pkgByAtom.get(p.atomId) ?? 0) + 1);
      const pkgCount: Record<string, number> = {};
      for (const n of nodes) if (n.kind === "atom") pkgCount[n.id] = pkgByAtom.get(n.id) ?? 0;
      return NextResponse.json({ subjects, subjectId, nodes, pkgCount });
    }
    default:
      return NextResponse.json({ error: "view không hợp lệ" }, { status: 400 });
  }
}
