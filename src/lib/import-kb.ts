// Trộn dữ liệu phân rã SẠCH (đúng schema) vào DB đang chạy — THUẦN CODE, không gọi AI.
// Dùng lại đúng khuôn file mà kb-seed đã nạp (atoms + edges). Validator chặn rác;
// upsert theo MÃ, không xoá/không đụng gói-duyệt-tài liệu đã có (an toàn, chạy lại nhiều lần vẫn đúng).
import { DB, TreeNode, Edge, AtomType, EdgeRelation, Reference, Question } from "./store";
import { newKC, newE, newQ } from "./ids";

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
function clean(s: unknown): string { return String(s ?? "").replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => ENT[m]).replace(/\s+/g, " ").trim(); }
function tex(s: string): string { return s.replace(/\\\\/g, "\\"); }
function txt(s: unknown): string { return tex(clean(s)); }
// Suy chương từ mã (khuôn -C01-, .C1., C01…) hoặc từ cột "chương" khi mã không mã hoá sẵn.
// Trả cả `num` (để đặt tên/thứ tự) lẫn `key` (đoạn định danh trong id node — ổn định, duy nhất/ chương).
const chapInfo = (code: string, chapterField?: string) => {
  const m = code.match(/[-.\s]C0*(\d+)/i);
  if (m) { const n = parseInt(m[1], 10); return { num: n, key: String(n).padStart(2, "0") }; }
  const cm = String(chapterField || "").match(/\d+/);
  if (cm) { const n = parseInt(cm[0], 10); return { num: n, key: String(n).padStart(2, "0") }; }
  const name = clean(chapterField);
  if (name) return { num: 0, key: "x" + Math.abs(hash(name)).toString(36).slice(0, 5) };
  return { num: 0, key: "00" };
};
// Cụm ("Điểm kiến thức"): lấy chữ cụm trong mã nếu có, ngược lại gom theo TÊN cụm (cột cluster).
const cluInfo = (code: string, clusterField?: string) => {
  const name = clean(clusterField);
  const m = code.match(/[-.]C\d+[-.]([A-Za-z])/);
  if (m) { const L = m[1].toUpperCase(); return { key: L, title: name || `Cụm ${L}`, order: L.charCodeAt(0) }; }
  if (name) return { key: "s" + Math.abs(hash(name)).toString(36).slice(0, 5), title: name, order: 0 };
  return { key: "A", title: "Điểm kiến thức", order: 65 };
};
const atomOrder = (code: string) => { const m = code.match(/(\d+)([a-z]?)$/); return m ? parseInt(m[1], 10) * 10 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : 0; };
const ATOM_TYPES = new Set(["KN", "QT", "KY", "VD"]);
function normRelation(r: string): EdgeRelation { const s = (r || "").toLowerCase(); if (s.includes("prereq")) return "prerequisite_hard"; if (s.includes("miscon")) return "misconception"; return "related_soft"; }
const SUBJECT_SLUG: Record<string, string> = {
  "Toán": "toan", "Ngữ văn": "nguvan", "Tiếng Anh": "tienganh", "Tiếng Việt": "tiengviet",
  // map về đúng id môn đã seed — tránh tạo môn trùng khi import (slug normalize sẽ ra "vat-li" ≠ "vatli")
  "Vật lí": "vatli", "Vật lý": "vatli", "Hoá học": "hoahoc", "Hóa học": "hoahoc", "Sinh học": "sinhhoc",
  "Công nghệ": "congnghe", "Khoa học tự nhiên": "khtn", "Giáo dục công dân": "gdcd",
  "Lịch sử và Địa lí": "lichsu-diali", "Tin học": "tinhoc",
  // môn chưa seed — chọn slug gọn
  "Địa lí": "diali", "Địa lý": "diali", "Giáo dục kinh tế và pháp luật": "gdktpl", "Oxford English": "oxford",
};
function slugSubject(title: string): string { return SUBJECT_SLUG[title] || title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

export interface RawAtom { code: string; label: string; cluster: string; type?: string; bloom?: string; dok?: number; nangLuc?: string; yeuCau?: string; quanNiemSai?: string; chapter: string; grade: number; subject: string; thamDinh?: string }
export interface RawEdge { idEdge?: string; from: string; to: string; relation: string; weight?: number; bloomGap?: number; quanNiemSai?: string; tanSuat?: string; remediationHint?: string; crossSubject?: string; verified?: string }
export interface RawRef { code: string; title: string; url: string; kind?: string }

export interface ImportResult {
  errors: string[];
  atomsNew: number; atomsUpdated: number; atomsSkipped: number;
  edgesNew: number; edgesUpdated: number; edgesSkipped: number;
  nodesCreated: number; applied: boolean; sampleNew: string[];
}

// dryRun=true → chỉ tính diff (không ghi). dryRun=false → áp dụng.
export function importKnowledge(db: DB, atomsIn: unknown, edgesIn: unknown, opts: { dryRun: boolean }): ImportResult {
  const atoms = Array.isArray(atomsIn) ? (atomsIn as RawAtom[]) : [];
  const edges = Array.isArray(edgesIn) ? (edgesIn as RawEdge[]) : [];
  const errors: string[] = [];
  const res: ImportResult = { errors, atomsNew: 0, atomsUpdated: 0, atomsSkipped: 0, edgesNew: 0, edgesUpdated: 0, edgesSkipped: 0, nodesCreated: 0, applied: !opts.dryRun, sampleNew: [] };
  const dry = opts.dryRun;

  const byId = new Map(db.tree.map((n) => [n.id, n]));
  // Sau đồng nhất ID: atom.id = KC (ngẫu nhiên), atom.code = mã vị trí. Tra atom cũ theo CODE, không theo id.
  const atomByCode = new Map(db.tree.filter((n) => n.kind === "atom" && n.code).map((n) => [n.code!, n]));
  const nonAtomByCode = new Map(db.tree.filter((n) => n.kind !== "atom" && n.code).map((n) => [n.code!, n]));
  const usedIds = new Set(db.tree.map((n) => n.id));   // để newKC không trùng
  const orderIn = (pid: string | null) => db.tree.filter((n) => n.parentId === pid).length;
  const ensure = (n: TreeNode): TreeNode => {
    const cur = byId.get(n.id);
    if (cur) return cur;
    byId.set(n.id, n);            // map cục bộ để không đếm trùng chương/cụm dùng chung
    if (!dry) db.tree.push(n);
    res.nodesCreated++;
    return n;
  };

  let i = 0;
  for (const a of atoms) {
    i++;
    const code = clean(a.code), label = txt(a.label);
    if (!code) { errors.push(`Nguyên tử dòng ${i}: thiếu mã (code)`); res.atomsSkipped++; continue; }
    if (!label) { errors.push(`Dòng ${i} · ${code}: thiếu tên (label)`); res.atomsSkipped++; continue; }
    const grade = Number(a.grade);
    if (!grade) { errors.push(`Dòng ${i} · ${code}: thiếu lớp (grade)`); res.atomsSkipped++; continue; }
    const subjectTitle = clean(a.subject) || "Toán";

    const subjId = slugSubject(subjectTitle);
    ensure({ id: subjId, kind: "subject", parentId: null, title: subjectTitle, code: subjId.toUpperCase().slice(0, 4), order: byId.get(subjId)?.order ?? orderIn(null), refs: byId.get(subjId)?.refs });
    const gradeId = `${subjId}-g${grade}`;
    ensure({ id: gradeId, kind: "grade", parentId: subjId, title: `Lớp ${grade}`, code: `${subjId}.G${grade}`, order: grade, grade });
    const ch = chapInfo(code, a.chapter);
    const chId = `${gradeId}-C${ch.key}`;
    ensure({ id: chId, kind: "chapter", parentId: gradeId, title: clean(a.chapter) || `Chương ${ch.num}`, code: code.slice(0, 8), order: ch.num });
    const clu = cluInfo(code, a.cluster);
    const lessonId = `${chId}-${clu.key}`;
    ensure({ id: lessonId, kind: "lesson", parentId: chId, title: clu.title, code: `${chId}-${clu.key}`, order: clu.order });

    const type = a.type && ATOM_TYPES.has(a.type) ? (a.type as AtomType) : undefined;
    const meta = { title: label, atomType: type, bloom: clean(a.bloom) || undefined, dok: Number(a.dok) || undefined, nangLuc: clean(a.nangLuc) || undefined, yeuCau: txt(a.yeuCau) || undefined, quanNiemSai: txt(a.quanNiemSai) || undefined, verified: /✔|đạt|verified|true|đã duyệt|approved/i.test(a.thamDinh || "") };
    const existing = atomByCode.get(code);         // tra theo MÃ VỊ TRÍ (code), id atom giờ là KC
    if (existing) {
      if (!dry) Object.assign(existing, meta);       // cập nhật metadata, GIỮ id(KC) + vị trí + refs + gói
      res.atomsUpdated++;
    } else if (nonAtomByCode.has(code)) {
      errors.push(`Dòng ${i} · ${code}: mã trùng một mục KHÔNG phải nguyên tử — bỏ qua`); res.atomsSkipped++;
    } else {
      const kc = newKC(db, usedIds);                 // atom mới: id = KC ngẫu nhiên, code = mã vị trí
      const atom: TreeNode = { id: kc, kind: "atom", parentId: lessonId, code, order: atomOrder(code), refs: [], ...meta };
      atomByCode.set(code, atom);
      if (!dry) db.tree.push(atom);
      res.atomsNew++;
      if (res.sampleNew.length < 8) res.sampleNew.push(code);
    }
  }

  // Cạnh: from/to trong file là MÃ VỊ TRÍ → quy về KC; khớp cạnh cũ theo bộ ba (from|to|relation), không theo id vị trí.
  const edgeByTriple = new Map(db.edges.map((e) => [`${e.from}|${e.to}|${e.relation}`, e]));
  let j = 0;
  for (const e of edges) {
    j++;
    const fromC = clean(e.from), toC = clean(e.to);
    if (!fromC || !toC) { errors.push(`Cạnh dòng ${j}: thiếu from/to`); res.edgesSkipped++; continue; }
    const fromA = atomByCode.get(fromC), toA = atomByCode.get(toC);
    if (!fromA || !toA) { errors.push(`Cạnh dòng ${j} · ${fromC}→${toC}: có nguyên tử chưa tồn tại — bỏ qua`); res.edgesSkipped++; continue; }
    const from = fromA.id, to = toA.id, relation = normRelation(e.relation);   // from/to = KC
    const fields = { from, to, relation, weight: Number(e.weight) || 0.4, bloomGap: e.bloomGap != null ? Number(e.bloomGap) : undefined, quanNiemSai: txt(e.quanNiemSai) || undefined, tanSuat: clean(e.tanSuat) || undefined, remediationHint: txt(e.remediationHint) || undefined, crossSubject: clean(e.crossSubject) || undefined, verified: /đạt|✔|verified|true|done|đã duyệt|approved/i.test(e.verified || "") };
    const cur = edgeByTriple.get(`${from}|${to}|${relation}`);
    if (cur) { if (!dry) Object.assign(cur, fields); res.edgesUpdated++; }
    else { res.edgesNew++; if (!dry) { const rec: Edge = { id: newE(db), ...fields }; db.edges.push(rec); edgeByTriple.set(`${from}|${to}|${relation}`, rec); } }
  }
  return res;
}

// ── Gắn tài liệu tham khảo hàng loạt: mỗi dòng {code, title, url, kind} → gắn vào node theo MÃ ──
export interface RefsResult { errors: string[]; attached: number; skipped: number; nodesTouched: number; applied: boolean }
function safeUrl(raw: string): string | null {
  let u = String(raw || "").trim(); if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && /\./.test(u)) u = "https://" + u;
  try { const p = new URL(u); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null; } catch { return null; }
}
export function importRefs(db: DB, refsIn: unknown, opts: { dryRun: boolean }): RefsResult {
  const refs = Array.isArray(refsIn) ? (refsIn as RawRef[]) : [];
  const res: RefsResult = { errors: [], attached: 0, skipped: 0, nodesTouched: 0, applied: !opts.dryRun };
  const byCode = new Map<string, TreeNode>();
  for (const n of db.tree) { byCode.set(n.id, n); if (n.code) byCode.set(n.code, n); }
  const touched = new Set<string>();
  let i = 0;
  for (const r of refs) {
    i++;
    const code = clean(r.code), title = clean(r.title);
    const url = safeUrl(r.url);
    const node = byCode.get(code);
    if (!node) { res.errors.push(`Dòng ${i} · ${code}: không tìm thấy mục có mã này`); res.skipped++; continue; }
    if (!title) { res.errors.push(`Dòng ${i} · ${code}: thiếu tên tài liệu`); res.skipped++; continue; }
    if (!url) { res.errors.push(`Dòng ${i} · ${code}: link không hợp lệ (chỉ nhận http/https)`); res.skipped++; continue; }
    const kind = (["drive", "sgk", "video", "link"].includes(String(r.kind)) ? r.kind : "link") as Reference["kind"];
    const cur = node.refs || [];
    if (cur.some((x) => x.url === url)) { res.skipped++; continue; }   // đã có link này
    if (!opts.dryRun) node.refs = [...cur, { id: "rf_" + Math.abs(hash(code + url)).toString(36), title: title.slice(0, 200), url: url.slice(0, 600), kind }];
    res.attached++; touched.add(node.id);
  }
  res.nodesTouched = touched.size;
  return res;
}
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

// ── Ngân hàng câu hỏi: mỗi dòng {id, atom, noiDung, …} → gắn vào nguyên tử theo MÃ ──
// Câu hỏi do kho sản xuất kèm phân rã (không phải AI sinh). Upsert theo id câu hỏi: chạy lại không đẻ trùng.
export interface RawQuestion {
  id?: string; atom?: string; atomId?: string; noiDung?: string;
  tier?: string; dok?: number; doKho?: string; dapAn?: string; loiGiai?: string; thamSoHoa?: string;
  nhieu?: { noiDung?: string; lyDo?: string }[];
}
export interface QuestionsResult { errors: string[]; created: number; updated: number; skipped: number; atomsTouched: number; applied: boolean }

export function importQuestions(db: DB, rowsIn: unknown, opts: { dryRun: boolean }): QuestionsResult {
  const rows = Array.isArray(rowsIn) ? (rowsIn as RawQuestion[]) : [];
  const res: QuestionsResult = { errors: [], created: 0, updated: 0, skipped: 0, atomsTouched: 0, applied: !opts.dryRun };
  // File kho gắn câu theo MÃ VỊ TRÍ nguyên tử → quy về KC. id câu giờ là Q-; giữ mã câu cũ ở `key`.
  const atomByCode = new Map(db.tree.filter((n) => n.kind === "atom" && n.code).map((n) => [n.code!, n]));
  const qByKey = new Map(db.questions.map((q) => [`${q.atomId}#${q.key ?? q.id}`, q]));  // (atomKC, mã câu) → câu
  const dry = opts.dryRun;
  const touched = new Set<string>();
  let i = 0;
  for (const r of rows) {
    i++;
    const atomCode = clean(r.atom ?? r.atomId);
    const noiDung = txt(r.noiDung);
    if (!atomCode) { res.errors.push(`Câu dòng ${i}: thiếu mã nguyên tử`); res.skipped++; continue; }
    const atom = atomByCode.get(atomCode);
    if (!atom) { res.errors.push(`Câu dòng ${i} · ${atomCode}: nguyên tử chưa tồn tại — bỏ qua`); res.skipped++; continue; }
    if (!noiDung) { res.errors.push(`Câu dòng ${i} · ${atomCode}: thiếu nội dung câu hỏi`); res.skipped++; continue; }
    const atomId = atom.id;   // KC
    // ⚠ mã câu trong file kho CHỈ duy nhất trong phạm vi cụm (A01-Q01 xuất hiện ở nhiều chương).
    // Khoá thật = nguyên tử(KC) + mã câu; lấy mã câu trần làm khoá là nuốt mất hơn nửa ngân hàng.
    const key = clean(r.id) || `q${Math.abs(hash(noiDung)).toString(36)}`;
    const fields = {
      atomId, noiDung, key,
      tier: clean(r.tier) || undefined,
      dok: Number(r.dok) || undefined,
      doKho: clean(r.doKho) || undefined,
      dapAn: txt(r.dapAn) || undefined,
      loiGiai: txt(r.loiGiai) || undefined,
      thamSoHoa: txt(r.thamSoHoa) || undefined,
      nhieu: (r.nhieu || []).map((n) => ({ noiDung: txt(n?.noiDung), lyDo: txt(n?.lyDo) || undefined })).filter((n) => n.noiDung),
    };
    const cur = qByKey.get(`${atomId}#${key}`);
    if (cur) { if (!dry) Object.assign(cur, fields); res.updated++; }
    else { res.created++; if (!dry) { const q: Question = { id: newQ(db), ...fields }; db.questions.push(q); qByKey.set(`${atomId}#${key}`, q); } }
    touched.add(atomId);
  }
  res.atomsTouched = touched.size;
  return res;
}
