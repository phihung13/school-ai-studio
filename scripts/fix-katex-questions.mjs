// ─────────────────────────────────────────────────────────────────────────────
// VÁ CÔNG THỨC KaTeX cho 67 CÂU HỎI (bàn giao đội Tutor 2026-07-25, docs/katex-fixlist.csv).
//
// BỐI CẢNH (đọc kỹ trước khi chạy):
//  • Tutor render mọi công thức qua KaTeX; câu nào KHÔNG parse được thì giữ ở "review", không tới học sinh.
//  • ĐIỀU TRA: chạy CHÍNH pipeline render của Studio (splitMath+normalizeTex+KaTeX) trên 67 câu → 0/67 HỎNG.
//    Nghĩa là KHÔNG phải "Studio soạn sai nguồn". 2 lệch với renderer Tutor: (a) Tutor thiếu luật blank `_{2,}`→\underline
//    của Studio; (b) Tutor ÉP mathify văn xuôi Unicode (∈ ℕ ² θ̄ …) không bọc `$` rồi vỡ. Studio chỉ render đoạn có delimiter.
//  • QUYẾT ĐỊNH (Hùng 25/07): Studio ÔM hết 67, chuẩn hoá nguồn cho render đúng trên MỌI renderer — độc lập, không chờ Tutor.
//
// CÁCH VÁ: chỉ trung hoà 5 "thủ phạm" thật (KHÔNG LaTeX-hoá toàn bộ văn xuôi):
//   1. Ngoặc `{…}` (Tutor ôm cả cụm tiếng Việt vào 1 nhóm math rồi vỡ) → bọc RIÊNG ngoặc: `{`→`$\{$`  `}`→`$\}$`,
//      ruột (∈ ≤ | chữ Việt) thành văn xuôi lẻ — thứ Tutor render bình thường. (pass wrapBareBraces, bỏ qua đoạn đã $…$)
//   2. Hiệu tập `A\B` (backslash trần → \B là lệnh lạ) → `$A\setminus B$`. (EDITS surgical)
//   3. Blank `____` dính `^`/`{}` → `\underline{\hphantom{00}}`. (bên trong delim + EDITS)
//   4. Dấu ghép macron `θ̄`/`X̄` (U+0304) → `$\bar{…}$`. (fixMacron)
//   5. Nháy thẳng `'` sau mũ (→ prime, "double superscript") → nháy cong `'…'`. (EDITS)
//
// TRẠNG THÁI: dry-run đã VALIDATE 100% (87 trường / 67 câu, 0 lỗi KaTeX-strict). Trang duyệt (before/after render):
//   https://claude.ai/code/artifact/b2742788-10fa-4c7d-8c7e-1a2319bb7b61
//
// CÁCH DÙNG:
//   node scripts/fix-katex-questions.mjs                # DRY-RUN: đọc data/studio.db, vá, validate, xuất changes.json
//   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/fix-katex-questions.mjs --write-kv
//                                                       # GHI THẬT vào studio_kv (project jhqdzrejpcvasbsnamer)
//
// CÒN LẠI (làm tiếp khi có key jhqdzrej…, xem memory [[katex-fix-67-cau]]):
//   • --write-kv: đọc GIÁ TRỊ HIỆN TẠI từ studio_kv rồi áp transform (chống lệch), upsert lại. Code có sẵn dưới — CHƯA
//     chạy thật lần nào (chưa có key) → chạy phải xem log kỹ, so số field đổi với dry-run (87).
//   • Bảng `questions` trong KG store (Tutor cũng đọc — Hùng chốt "CẢ HAI"): cần INSPECT schema cột trước
//     (GET {REST}/questions?limit=1) rồi map field noi_dung/dap_an/loi_giai/distractors → viết bước ghi tương tự.
//   • Sau ghi: Tutor re-export/re-import (convert-studio-questions.ts đọc JSON Studio xuất) → câu tự lên "active".
// ─────────────────────────────────────────────────────────────────────────────
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import katex from "katex";

// ── Transform (idempotent + surgical) ────────────────────────────────────────
const bakeBlank = s => s.replace(/_{2,}/g, "\\underline{\\hphantom{00}}");
const fixMacron = s => s.replace(/(\S)̄/g, (_, c) => `$\\bar{${c === "θ" ? "\\theta" : c}}$`);
const bakeBlankInDelims = s => s.replace(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$[^$\n]+?\$)/g, m => bakeBlank(m));
function wrapBareBraces(s) {
  return s.replace(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$[^$\n]+?\$)|([{}])/g, (m, delim, brace, off, str) => {
    if (delim) return delim;                 // giữ đoạn đã delimited
    if (str[off - 1] === "\\") return brace;  // \{ \} đã escape
    return brace === "{" ? "$\\{$" : "$\\}$";
  });
}

const EDITS = [];
const E = (id, path, find, replace) => EDITS.push([id, path, find, replace]);
// D — nháy thẳng → cong
E("Q-0000086", "noiDung", "P: 'Tam giác ABC vuông tại A', Q: 'BC² = AB² + AC²'.", "P: ‘Tam giác ABC vuông tại A’, Q: ‘BC² = AB² + AC²’.");
E("Q-0001317", "noiDung", "'tìm x để diện tích hình chữ nhật VƯỢT QUÁ 100m²'", "‘tìm x để diện tích hình chữ nhật VƯỢT QUÁ 100m²’");
E("Q-0001317", "noiDung", "'x<−2 hoặc x>50'", "‘x<−2 hoặc x>50’");
E("Q-0001645", "loiGiai", "Chỉ 'có cả x² và y²' thì", "Chỉ ‘có cả x² và y²’ thì");
E("Q-0001811", "noiDung", "'HỆ SỐ của x³'", "‘HỆ SỐ của x³’");
E("Q-0001811", "noiDung", "'SỐ HẠNG chứa x³'", "‘SỐ HẠNG chứa x³’");
E("Q-0001810", "noiDung", "'số hạng chứa x^m'", "‘số hạng chứa xᵐ’");
// domains — set-difference
E("Q-0001100", "dapAn", "D=R\\{2}", "$D=\\mathbb{R}\\setminus\\{2\\}$");
E("Q-0001100", "dapAn", "tập giá trị là R\\{0}", "tập giá trị là $\\mathbb{R}\\setminus\\{0\\}$");
E("Q-0001109", "dapAn", "D=R\\{−3;3}", "$D=\\mathbb{R}\\setminus\\{-3;3\\}$");
E("Q-0001109", "nhieu:0", "D=R\\{9}", "$D=\\mathbb{R}\\setminus\\{9\\}$");
E("Q-0001110", "dapAn", "D=[−3;+∞)\\{1}", "$D=[-3;+\\infty)\\setminus\\{1\\}$");
E("Q-0001110", "nhieu:0", "'D=[−3;+∞) (quên loại bỏ x=1)'", "‘D=$[-3;+\\infty)$ (quên loại bỏ x=1)’");
E("Q-0001112", "dapAn", "D=[−3;3]\\{−2}", "$D=[-3;3]\\setminus\\{-2\\}$");
E("Q-0001112", "loiGiai", "kết hợp: D=[−3;3]\\{−2}.", "kết hợp: $D=[-3;3]\\setminus\\{-2\\}$.");
E("Q-0001112", "nhieu:0", "D=[−3;3]", "$D=[-3;3]$");
// blank sau ^ / bare \bar / \n
E("Q-0000897", "dapAn", "|a-\\bar{a}|", "$|a-\\bar{a}|$");
E("Q-0001343", "noiDung", "Phương trình √f(x)=g(x) tương đương với: g(x)≥____ và f(x)=[g(x)]^____.",
  "Phương trình $\\sqrt{f(x)}=g(x)$ tương đương với: $g(x)\\ge$ ____ và $f(x)=[g(x)]^{\\underline{\\hphantom{00}}}$.");
E("Q-0002619", "noiDung", "Healthy Tips\\n1. You must sleep 8 hours.\\n2. You must sleep well.\\n3. You must go to bed early.",
  "Healthy Tips · 1. You must sleep 8 hours. · 2. You must sleep well. · 3. You must go to bed early.");
// B set-difference (bọc split, giữ chữ Việt ngoài $)
E("Q-0000246", "dapAn", "vùng B\\A KHÔNG rỗng", "vùng $B\\setminus A$ KHÔNG rỗng");
E("Q-0000326", "dapAn", "A \\ B = {a}", "$A\\setminus B=\\{a\\}$");
E("Q-0000326", "dapAn", "B \\ A = {d}", "$B\\setminus A=\\{d\\}$");
E("Q-0000326", "dapAn", "{a} ≠ {d} ⇒ A\\B ≠ B\\A", "$\\{a\\}\\ne\\{d\\}$ ⇒ $A\\setminus B\\ne B\\setminus A$");
E("Q-0000326", "nhieu:0", "B1 ra {b;c}", "B1 ra $\\{b;c\\}$");
E("Q-0000327", "noiDung", "A\\B = B\\A. Tôi tính A\\B = {1}. Vậy B\\A cũng = {1}.",
  "$A\\setminus B=B\\setminus A$. Tôi tính $A\\setminus B=\\{1\\}$. Vậy $B\\setminus A$ cũng $=\\{1\\}$.");
E("Q-0000327", "dapAn", "Phần tính A\\B ĐÚNG ({1})", "Phần tính $A\\setminus B$ ĐÚNG ($\\{1\\}$)");
E("Q-0000327", "dapAn", "B\\A = bỏ khỏi B={2;3} những gì có trong A={1;2} → bỏ số 2 → B\\A = {3}. Vậy A\\B={1} ≠ B\\A={3}!",
  "$B\\setminus A$ = bỏ khỏi $B=\\{2;3\\}$ những gì có trong $A=\\{1;2\\}$ → bỏ số 2 → $B\\setminus A=\\{3\\}$. Vậy $A\\setminus B=\\{1\\}\\ne B\\setminus A=\\{3\\}$!");
E("Q-0000327", "loiGiai", "Đạt (tính đúng B\\A={3})", "Đạt (tính đúng $B\\setminus A=\\{3\\}$)");
E("Q-0000330", "dapAn", "A\\B = 'bé có gì mà Nam KHÔNG có?'", "$A\\setminus B$ = ‘bé có gì mà Nam KHÔNG có?’");
E("Q-0000330", "dapAn", "B\\A = 'Nam có gì mà bé KHÔNG có?'", "$B\\setminus A$ = ‘Nam có gì mà bé KHÔNG có?’");
E("Q-0000330", "dapAn", "cái đứng TRƯỚC dấu \\ là 'CHỦ NHÀ'", "cái đứng TRƯỚC dấu $\\setminus$ là ‘CHỦ NHÀ’");
E("Q-0000330", "loiGiai", "\\ thì KHÔNG! Giống toán số", "$\\setminus$ thì KHÔNG! Giống toán số");
E("Q-0000330", "loiGiai", "phân biệt A\\B (còn lại trong A) vs B\\A;", "phân biệt $A\\setminus B$ (còn lại trong A) vs $B\\setminus A$;");
E("Q-0000330", "loiGiai", "nêu ∩,∪ giao hoán nhưng \\ thì KHÔNG.", "nêu ∩,∪ giao hoán nhưng $\\setminus$ thì KHÔNG.");
E("Q-0000362", "loiGiai", "A\\B = {1} ≠ B\\A = {3}.", "$A\\setminus B=\\{1\\}\\ne B\\setminus A=\\{3\\}$.");
E("Q-0000364", "loiGiai", "A\\B = {1} nhưng B\\A = {3}", "$A\\setminus B=\\{1\\}$ nhưng $B\\setminus A=\\{3\\}$");
E("Q-0000365", "loiGiai", "A\\A = ∅ (bỏ hết)", "$A\\setminus A=\\varnothing$ (bỏ hết)");
E("Q-0000367", "noiDung", "(A\\B)\\C = A\\(B\\C).", "$(A\\setminus B)\\setminus C=A\\setminus(B\\setminus C)$.");
E("Q-0000367", "noiDung", "vế trái (A\\B) = {1;3} → {1;3}\\{3} = {1}.", "vế trái $(A\\setminus B)=\\{1;3\\}$ → $\\{1;3\\}\\setminus\\{3\\}=\\{1\\}$.");
E("Q-0000367", "noiDung", "Vế phải (B\\C) = {2} → A\\{2} = {1;3}.", "Vế phải $(B\\setminus C)=\\{2\\}$ → $A\\setminus\\{2\\}=\\{1;3\\}$.");
E("Q-0000367", "dapAn", "(A\\B)\\C = {1} ≠ A\\(B\\C) = {1;3}", "$(A\\setminus B)\\setminus C=\\{1\\}\\ne A\\setminus(B\\setminus C)=\\{1;3\\}$");
E("Q-0000369", "dapAn", "A\\B = {1}, B\\A = {3} ⇒ A\\B ≠ B\\A", "$A\\setminus B=\\{1\\}$, $B\\setminus A=\\{3\\}$ ⇒ $A\\setminus B\\ne B\\setminus A$");
E("Q-0000369", "dapAn", "(A\\B)\\C = {1;3}\\{3} = {1}; A\\(B\\C) = A\\{2} = {1;3}",
  "$(A\\setminus B)\\setminus C=\\{1;3\\}\\setminus\\{3\\}=\\{1\\}$; $A\\setminus(B\\setminus C)=A\\setminus\\{2\\}=\\{1;3\\}$");

const EDIT_MAP = {};
for (const [id, p, find, replace] of EDITS) (EDIT_MAP[id] ||= []).push([p, find, replace]);

function fixOne(id, fieldPath, value) {
  if (typeof value !== "string" || !value) return value;
  let v = value;
  for (const [p, find, replace] of EDIT_MAP[id] || []) if (p === fieldPath && v.includes(find)) v = v.split(find).join(replace);
  return wrapBareBraces(fixMacron(bakeBlankInDelims(v)));   // regex idempotent + bọc ngoặc
}
export function fixQuestion(q) {
  const out = JSON.parse(JSON.stringify(q));
  const changed = [];
  const doF = (p, before, set) => { const after = fixOne(q.id, p, before); if (after !== before && after != null) { changed.push({ path: p, before, after }); set(after); } };
  for (const f of ["noiDung", "dapAn", "loiGiai"]) doF(f, out[f], v => { out[f] = v; });
  (out.nhieu || []).forEach((n, i) => doF("nhieu:" + i, n.noiDung, v => { n.noiDung = v; }));
  return { q: out, changed };
}

// ── Validate tương đương Tutor: đoạn delimited parse KaTeX-strict + ngoài $ không còn thủ phạm ──
const DELIM = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+?\$)/g;
const norm = t => t.replace(/_{2,}/g, "\\underline{\\hphantom{00}}");
export function validateField(s) {
  if (typeof s !== "string" || !s) return [];
  const problems = []; let m, last = 0; const outside = []; DELIM.lastIndex = 0;
  while ((m = DELIM.exec(s))) {
    outside.push(s.slice(last, m.index));
    const tok = m[0], inner = tok.startsWith("$") ? tok.slice(1, -1) : tok.slice(2, -2);
    try { katex.renderToString(norm(inner), { throwOnError: true, strict: false }); }
    catch (e) { problems.push("KaTeX «" + inner.slice(0, 40) + "» " + e.message.split("\n")[0].slice(0, 50)); }
    last = m.index + tok.length;
  }
  outside.push(s.slice(last));
  const out = outside.join(" ");
  if (/\\[A-Za-z]/.test(out)) problems.push("\\lệnh ngoài $");
  if (/\^_{2,}|[A-Za-z0-9)\]}]_{2,}/.test(out)) problems.push("blank dính ^/_");
  if (/̄/.test(out)) problems.push("macron U+0304");
  if (/[²³]\s*'/.test(out)) problems.push("prime sau mũ");
  if (/[{}]/.test(out)) problems.push("ngoặc {…} ngoài $");
  return problems;
}

function idsFromCsv() {
  const csv = readFileSync(path.resolve("docs/katex-fixlist.csv"), "utf8").split(/\r?\n/).slice(1).filter(Boolean);
  return [...new Set(csv.map(l => l.match(/^"([^"]+)"/)?.[1]).filter(Boolean))];
}
function validateQ(q) {
  const checks = [q.noiDung, q.dapAn, q.loiGiai, ...(q.nhieu || []).map(n => n.noiDung)];
  return checks.flatMap(v => validateField(v));
}

// ── DRY-RUN: đọc studio.db local ─────────────────────────────────────────────
async function dryRun() {
  const dbFile = process.env.STUDIO_DB || "data/studio.db";
  const db = new DatabaseSync(path.resolve(dbFile));
  const ids = idsFromCsv();
  const rows = db.prepare("SELECT id,j FROM questions WHERE id IN (" + ids.map(() => "?").join(",") + ")").all(...ids);
  const map = Object.fromEntries(rows.map(r => [r.id, JSON.parse(r.j)]));
  let changedFields = 0, failFields = 0; const changes = [];
  for (const id of ids) {
    const q = map[id]; if (!q) { console.log("THIẾU trong db:", id); continue; }
    const { q: fixed, changed } = fixQuestion(q);
    changedFields += changed.length;
    for (const c of changed) changes.push({ id, ...c });
    for (const p of validateQ(fixed)) { failFields++; console.log(`✗ ${id}: ${p}`); }
  }
  writeFileSync("katex-changes.json", JSON.stringify(changes, null, 2));
  console.log(`\nDRY-RUN: ${changedFields} trường đổi / ${ids.length} câu · ${failFields} field còn HỎNG · → katex-changes.json`);
}

// ── WRITE studio_kv (CHƯA chạy thật — cần key jhqdzrej…; áp transform lên GIÁ TRỊ HIỆN TẠI, chống lệch) ──
async function writeKv() {
  const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, ""), KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!BASE || !KEY) { console.error("Cần SUPABASE_URL + SUPABASE_SERVICE_KEY (project jhqdzrejpcvasbsnamer)"); process.exit(1); }
  const REST = `${BASE}/rest/v1/studio_kv`, H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
  const ids = idsFromCsv();
  const inList = ids.map(id => `"${id}"`).join(",");
  const res = await fetch(`${REST}?collection=eq.questions&id=in.(${inList})&select=collection,id,ord,j`, { headers: H });
  if (!res.ok) { console.error("GET studio_kv lỗi", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  const rows = await res.json();
  const ups = []; let changedFields = 0, failFields = 0;
  for (const r of rows) {
    const { q: fixed, changed } = fixQuestion(r.j);       // r.j = object câu hỏi (jsonb). Áp lên GIÁ TRỊ HIỆN TẠI.
    if (!changed.length) continue;
    for (const p of validateQ(fixed)) { failFields++; console.log(`✗ ${r.id}: ${p}`); }
    changedFields += changed.length;
    ups.push({ collection: "questions", id: r.id, ord: r.ord ?? 0, j: fixed });
  }
  if (failFields) { console.error(`DỪNG: còn ${failFields} field hỏng sau vá — KHÔNG ghi.`); process.exit(1); }
  console.log(`Chuẩn bị upsert ${ups.length} câu (${changedFields} trường đổi). So với dry-run 87 trường để chắc.`);
  if (!process.argv.includes("--yes")) { console.log("Thêm --yes để GHI thật."); return; }
  const w = await fetch(`${REST}?on_conflict=collection,id`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(ups) });
  console.log(w.ok ? `✓ Ghi studio_kv xong (${ups.length} câu). NHỚ: restart VPS để pull-db + ghi bảng questions KG store (xem header).`
    : `✗ Ghi lỗi ${w.status}: ${(await w.text()).slice(0, 300)}`);
}

if (process.argv.includes("--write-kv")) await writeKv();
else await dryRun();
