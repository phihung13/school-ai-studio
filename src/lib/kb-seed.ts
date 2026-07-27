// Nạp cây tri thức THẬT từ dữ liệu phân rã đã trích ra data/import/*.json
// (thay cho seed Toán 6 cứng cũ). Cây: Môn → Lớp → Chương → Bài(=cluster) → [Điểm KT] → Nguyên tử + edges.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DB, TreeNode, Edge, EdgeRelation, AtomType, User, Settings, AssetFormat, FormatSkill } from "./store";

const IMPORT_DIR = path.join(process.cwd(), "data", "import");

function readJson<T>(name: string): T[] {
  try {
    const p = path.join(IMPORT_DIR, name);
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(raw) ? (raw as T[]) : [];
  } catch { return []; }
}

// gỡ HTML entity + bỏ khoảng trắng thừa (dữ liệu nguồn có &amp; &lt; …)
const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
function clean(s: unknown): string {
  return String(s ?? "").replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => ENT[m]).replace(/\s+/g, " ").trim();
}
// LaTeX nguồn dùng \\( … \\) (double backslash) → chuẩn về \( … \) cho renderer
function tex(s: string): string { return s.replace(/\\\\/g, "\\"); }
function txt(s: unknown): string { return tex(clean(s)); }

interface RawAtom { code: string; label: string; cluster: string; type: string; bloom: string; dok: number; nangLuc: string; yeuCau: string; chapter: string; grade: number; subject: string; thamDinh?: string; }
interface RawEdge { idEdge: string; from: string; to: string; relation: string; weight: number; bloomGap?: number; quanNiemSai?: string; tanSuat?: string; remediationHint?: string; crossSubject?: string; ghiChu?: string; verified?: string; }

const SUBJECT_SLUG: Record<string, string> = {
  "Toán": "toan", "Ngữ văn": "nguvan", "Tiếng Anh": "tienganh", "Tiếng Việt": "tiengviet",
};
function slugSubject(title: string): string {
  return SUBJECT_SLUG[title] || title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const chapNum = (code: string) => { const m = code.match(/-C(\d+)-/); return m ? parseInt(m[1], 10) : 0; };
const clusterLetter = (code: string) => { const m = code.match(/-C\d+-([A-Z])/); return m ? m[1] : "A"; };
const atomOrder = (code: string) => { const m = code.match(/-C\d+-[A-Z](\d+)([a-z]?)$/); return m ? parseInt(m[1], 10) * 10 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : 0; };
const ATOM_TYPES = new Set(["KN", "QT", "KY", "VD"]);
function normRelation(r: string): EdgeRelation {
  const s = (r || "").toLowerCase();
  if (s.includes("prereq")) return "prerequisite_hard";
  if (s.includes("miscon")) return "misconception";
  return "related_soft";
}

// Các môn còn lại của trường (chưa phân rã) → node trống để hiện ĐỎ trên heatmap
const OTHER_SUBJECTS: [string, string][] = [
  ["nguvan", "Ngữ văn"], ["tienganh", "Tiếng Anh"], ["khtn", "Khoa học tự nhiên"],
  ["lichsu-diali", "Lịch sử và Địa lí"], ["gdcd", "Giáo dục công dân"], ["tinhoc", "Tin học"],
  ["congnghe", "Công nghệ"], ["vatli", "Vật lí"], ["hoahoc", "Hoá học"], ["sinhhoc", "Sinh học"],
];
// Các lớp Toán chưa nạp atoms → grade trống (đỏ) để thấy độ phủ theo lớp
const EMPTY_TOAN_GRADES = [6, 8, 10, 11, 12];

export function buildSeed(): DB {
  const tree: TreeNode[] = [];
  const byId = new Map<string, TreeNode>();
  const push = (n: TreeNode) => { if (!byId.has(n.id)) { byId.set(n.id, n); tree.push(n); } return byId.get(n.id)!; };
  const orderIn = (parentId: string | null) => tree.filter((n) => n.parentId === parentId).length;

  const atoms = [...readJson<RawAtom>("toan7_atoms.json"), ...readJson<RawAtom>("toan9_atoms.json")];

  for (const a of atoms) {
    const subjectTitle = clean(a.subject) || "Toán";
    const subjId = slugSubject(subjectTitle);
    push({ id: subjId, kind: "subject", parentId: null, title: subjectTitle, code: subjId.toUpperCase().slice(0, 4), order: byId.has(subjId) ? byId.get(subjId)!.order : orderIn(null) });

    const gradeId = `${subjId}-g${a.grade}`;
    push({ id: gradeId, kind: "grade", parentId: subjId, title: `Lớp ${a.grade}`, code: `${subjId}.G${a.grade}`, order: a.grade, grade: Number(a.grade) });

    const cn = chapNum(a.code);
    const chId = `${gradeId}-C${String(cn).padStart(2, "0")}`;
    push({ id: chId, kind: "chapter", parentId: gradeId, title: clean(a.chapter), code: `${a.code.slice(0, 8)}`, order: cn });

    const letter = clusterLetter(a.code);
    const lessonId = `${chId}-${letter}`;
    push({ id: lessonId, kind: "lesson", parentId: chId, title: clean(a.cluster), code: `${chId}-${letter}`, order: letter.charCodeAt(0) });

    const type = ATOM_TYPES.has(a.type) ? (a.type as AtomType) : undefined;
    push({
      id: a.code, kind: "atom", parentId: lessonId, title: txt(a.label), code: a.code, order: atomOrder(a.code),
      atomType: type, bloom: clean(a.bloom) || undefined, dok: Number(a.dok) || undefined,
      nangLuc: clean(a.nangLuc) || undefined, yeuCau: txt(a.yeuCau) || undefined,
      verified: /✔|đạt|verified|true/i.test(a.thamDinh || ""),
    });
  }

  // Edges — chỉ giữ cạnh nối 2 nguyên tử đều tồn tại
  const atomIds = new Set(tree.filter((n) => n.kind === "atom").map((n) => n.id));
  const edges: Edge[] = [];
  const seenEdge = new Set<string>();
  for (const e of readJson<RawEdge>("toan7_edges.json")) {
    if (!atomIds.has(e.from) || !atomIds.has(e.to)) continue;
    const id = e.idEdge || `${e.from}__${e.to}__${e.relation}`;
    if (seenEdge.has(id)) continue; seenEdge.add(id);
    edges.push({
      id, from: e.from, to: e.to, relation: normRelation(e.relation), weight: Number(e.weight) || 0.4,
      bloomGap: e.bloomGap != null ? Number(e.bloomGap) : undefined,
      quanNiemSai: txt(e.quanNiemSai) || undefined, tanSuat: clean(e.tanSuat) || undefined,
      remediationHint: txt(e.remediationHint) || undefined, crossSubject: clean(e.crossSubject) || undefined,
      verified: /đạt|✔|verified|true|done/i.test(e.verified || ""),
    });
  }

  // Lớp Toán trống (đỏ)
  const toanId = slugSubject("Toán");
  if (byId.has(toanId)) for (const g of EMPTY_TOAN_GRADES) {
    push({ id: `${toanId}-g${g}`, kind: "grade", parentId: toanId, title: `Lớp ${g}`, code: `${toanId}.G${g}`, order: g, grade: g });
  }
  // Môn trống (đỏ)
  for (const [id, title] of OTHER_SUBJECTS) push({ id, kind: "subject", parentId: null, title, code: id.toUpperCase().slice(0, 4), order: orderIn(null) });

  // ── Người dùng + cấu hình (giữ như bản cũ) ──
  const users: User[] = [
    { id: "gv.lan", name: "Cô Lan", role: "teacher", subject: "Toán", title: "Giáo viên Toán" },
    { id: "tt.minh", name: "Thầy Minh", role: "lead", subject: "Toán", title: "Tổ trưởng tổ Toán" },
    { id: "qt.hung", name: "Anh Hùng", role: "admin", title: "Quản trị học thuật" },
    { id: "bgh.duong", name: "Thầy Dương", role: "principal", title: "Ban giám hiệu" },
  ];
  const sk = (agent: string, style: string, imageStyle: string, guide: string): FormatSkill => ({ agent, style, imageStyle, guide });
  const formatSkills: Record<AssetFormat, FormatSkill> = {
    text: sk("Soạn giả Văn bản", "Câu ngắn, xưng cô/thầy — em, in đậm từ khoá.", "", "Mở bài gợi động cơ → nội dung → ví dụ → chốt."),
    worksheet: sk("Soạn giả Phiếu học tập", "Có chỗ trống, tăng dần độ khó.", "", "3 phần: khởi động, luyện tập, thử thách."),
    slide: sk("Đạo diễn Slide", "Mỗi slide một ý, tối đa 5 dòng.", "Nền sáng, tối giản, tông xanh lá.", "6–8 slide."),
    quiz: sk("Chuyên gia Khảo thí", "Nhiễu hợp lý, bám chuẩn.", "", "MCQ/Đúng-Sai/Điền khuyết theo 3 mức."),
    mindmap: sk("Kiến trúc sư Sơ đồ", "Từ khoá súc tích.", "", "Gốc = nguyên tử; tối đa 3 cấp."),
    flashcard: sk("Chuyên gia Ghi nhớ", "Mặt trước hỏi, sau đáp gọn.", "", "4–6 thẻ."),
    podcast: sk("Biên kịch Podcast", "Hội thoại Cô Mai & bé Bin.", "", "10–14 lượt thoại."),
    video: sk("Đạo diễn Video", "Lời thoại ngắn.", "Hoạt hình 2D, xanh lá tươi.", "Storyboard 5 cảnh ~90s."),
  };
  const settings: Settings = {
    styleGuide: "Giọng thân thiện, xưng cô/thầy — em. Câu ngắn. Ví dụ đời thường học sinh Việt Nam. Thuật ngữ theo SGK GDPT 2018.",
    gradeRules: "Bám yêu cầu cần đạt của nguyên tử; không vượt chuẩn đầu ra khối lớp.",
    philosophy: "Vui vẻ & Thực dụng: học qua tình huống thật, luôn có phần \"vì sao\".",
    monthlyBudgetUsd: 200, formatSkills,
  };

  return {
    secret: crypto.randomBytes(24).toString("hex"),
    users, tree, edges,
    packages: [], assets: [], reviews: [], jobs: [], proposals: [], cardStates: [], questions: [], ladders: [],
    activity: [{ at: new Date(0).toISOString(), by: "Hệ thống", action: "nạp", target: `${atomIds.size} nguyên tử + ${edges.length} cạnh nối từ kho phân rã`, href: "/tree" }],
    settings,
  };
}
