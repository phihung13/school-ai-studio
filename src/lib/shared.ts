// Kiểu dữ liệu + nhãn dùng chung cho cả server và client (không import module Node)

export type Role = "teacher" | "lead" | "admin" | "principal";
export interface User { id: string; name: string; role: Role; subject?: string; title: string; email?: string; password?: string; }

export interface Reference { id: string; title: string; url: string; kind: "drive" | "sgk" | "link" | "video" }

// type nguyên tử theo phân rã GDPT 2018: Khái niệm · Quy tắc/Định lí · Kỹ năng · Vận dụng
export type AtomType = "KN" | "QT" | "KY" | "VD";
export interface TreeNode {
  id: string; kind: "subject" | "grade" | "chapter" | "lesson" | "point" | "atom";
  parentId: string | null; title: string; code: string; order: number; grade?: number;
  prereqIds?: string[]; refs?: Reference[];
  // ── metadata riêng của Nguyên tử (nạp từ file phân rã) ──
  atomType?: AtomType; bloom?: string; dok?: number; nangLuc?: string; yeuCau?: string;
  quanNiemSai?: string; // sai lầm điển hình của học sinh ở nguyên tử này (kho ghi sẵn trong file phân rã)
  verified?: boolean; // nguyên tử đã được chủ biên thẩm định chưa
}

// Câu hỏi trong ngân hàng đề, gắn thẳng vào một nguyên tử (kho sản xuất kèm phân rã).
export interface Question {
  id: string; atomId: string; noiDung: string;
  key?: string;      // mã câu trong cụm (stt cũ, vd "A01-Q01") — id là Q- nên giữ đây để re-import khớp theo atom+key
  tier?: string; dok?: number; doKho?: string;
  dapAn?: string; loiGiai?: string; thamSoHoa?: string;
  nhieu?: { noiDung: string; lyDo?: string }[]; // phương án nhiễu + lý do sai
}

// Thang Socratic — nạp từ Trạm 4. MỘT thang gỡ MỘT quan niệm sai của MỘT nguyên tử:
// hỏi dắt qua 4 bậc (siêu nhận thức → hướng chú ý → dẫn về tiền đề → giàn giáo mạnh),
// chỉ mở `day` (hệ đáp án) khi học sinh đã đủ nỗ lực theo `dieuKienMoDay`.
// 5 tổ xuất 5 khuôn JSON khác nhau (phẳng / lồng `rungs` / lồng 2 tầng `misconceptions`) — importLadders san phẳng hết.
export interface LadderRung { bac: number; loai?: string; cauHoi: string }
export interface Ladder {
  id: string; atomId: string;
  key?: string;               // ladder_key của kho — khoá upsert là (atomId, key), id là L-
  quanNiemSaiId?: string;     // mã quan niệm sai (MIS_…, M1…)
  quanNiemSai?: string;       // mô tả quan niệm sai thang này gỡ
  dapAnDung?: string;         // lời giải đúng / correct_answer
  bac: LadderRung[];          // 4 bậc theo thứ tự 1→4
  day?: string;               // ĐÁY: hệ đáp án, chỉ mở khi đủ nỗ lực
  dieuKienMoDay?: string;     // effort gate / luật cộng nỗ lực
  luuY?: string;              // lưu ý cho giáo viên
  nguon?: string;             // tên file kho, để truy vết
}

// Cạnh nối tri thức (đồ thị) — nạp từ bước "2. QUAN HỆ LIÊN KẾT"
export type EdgeRelation = "prerequisite_hard" | "related_soft" | "misconception";
export interface Edge {
  id: string; from: string; to: string; relation: EdgeRelation; weight: number;
  bloomGap?: number; quanNiemSai?: string; tanSuat?: string; remediationHint?: string;
  crossSubject?: string; verified?: boolean;
}

// Mindmap CẤU TRÚC (không phải AI sinh): dựng thẳng từ cây thật quanh 1 chương/bài
export interface OutlineNode { id: string; title: string; kind: TreeNode["kind"]; children: OutlineNode[] }

// Độ phủ 3 mức để tô màu heatmap
export type Cover3 = "empty" | "partial" | "full"; // đỏ · cam · xanh

export type PkgStatus = "draft_ai" | "edited" | "pending_review" | "approved";
export interface PkgFields {
  objective: string; explanation: string; example: string; counterExample: string;
  commonMistake: string; strategy: string; questions: string;
}
export interface AiReport {
  criteria: { name: string; ok: boolean; note: string }[];
  flags: string[]; summary: string;
}
export interface Pkg {
  id: string; atomId: string; level: 1 | 2 | 3; bloom: string; status: PkgStatus;
  fields: PkgFields; version: number; updatedAt: string; updatedBy: string;
  history: { version: number; at: string; by: string; note: string }[];
  aiReport?: AiReport;
}

export type AssetFormat = "text" | "worksheet" | "slide" | "quiz" | "mindmap" | "flashcard" | "podcast" | "video";
export type AssetStatus = "ready" | "generating" | "failed" | "outdated";
export interface Asset {
  id: string; packageId: string; format: AssetFormat; status: AssetStatus;
  content: unknown; createdAt: string; createdBy: string; model: string; tokens: number; costUsd: number; pkgVersion: number;
  archived?: boolean;  // lưu trữ: ẩn khỏi kho mặc định, xem lại bằng bộ lọc "Đã lưu trữ"
  folder?: string;     // thư mục gắn nhãn tự do trong kho học liệu
}

export interface Review {
  id: string; packageId: string; at: string; by: string; decision: "approved" | "returned";
  note: string; aiReport?: AiReport;
}

// ── Xưởng sản xuất: đơn sản xuất = nhiều "line item", biên dịch thành hàng đợi task ──
export type JobStatus = "running" | "paused" | "done" | "failed" | "stopped";
export interface JobItem { nodeId: string; nodeTitle: string; kind: "draft" | "asset"; formats: AssetFormat[]; levels: number[]; }
export interface JobTask { atomId: string; code: string; title: string; level: number; kind: "draft" | "asset"; format?: AssetFormat; status: "pending" | "done" | "failed" | "skipped"; }
export interface Job {
  id: string; title: string; status: JobStatus;
  items: JobItem[]; tasks: JobTask[];
  total: number; done: number; failed: number;
  log: string[]; tokens: number; costUsd: number; startedAt: string; finishedAt?: string; by: string;
}
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  running: "Đang chạy", paused: "Tạm dừng", done: "Hoàn tất", failed: "Lỗi", stopped: "Đã dừng",
};

// ── Ôn thẻ ghi nhớ (flashcard) theo lịch FSRS — trạng thái ôn tập của 1 học sinh cho 1 thẻ ──
export interface CardState {
  id: string; userId: string; atomId: string; idx: number;
  due: string; stability: number; difficulty: number; scheduled_days: number; learning_steps: number;
  reps: number; lapses: number; state: number; last_review?: string;
}

export interface Proposal {
  id: string; kind: "add" | "edit" | "merge" | "split"; targetTitle: string; description: string;
  status: "open" | "accepted" | "rejected"; by: string; at: string; decidedBy?: string; note?: string;
}

export interface Activity { id?: string; at: string; by: string; action: string; target: string; href?: string; }
export interface FormatSkill { agent: string; style: string; imageStyle: string; guide: string; audience?: string; length?: string; constraints?: string; sample?: string }
export interface Settings {
  styleGuide: string; gradeRules: string; philosophy: string; monthlyBudgetUsd: number; formatSkills?: Record<AssetFormat, FormatSkill>;
  // Kết nối Claude: nhập từ UI Cài đặt (ưu tiên) hoặc biến môi trường (fallback). Key KHÔNG BAO GIỜ trả thô về client.
  anthropicApiKey?: string; anthropicModel?: string;
  // Kết nối app Gia sư (tutor): đẩy học liệu Chuẩn trường qua import-kg. Mật khẩu/JWT KHÔNG trả thô về client,
  // chỉ lưu/gỡ qua op tutorSaveConfig (saveSettings bỏ qua các trường tutor*).
  tutorUrl?: string; tutorApikey?: string; tutorEmail?: string; tutorPassword?: string; tutorJwt?: string;
  // Bộ đếm ID tuần tự (Studio là bên sinh ID sau đồng nhất KC/Q/E/R). max đã cấp; sinh mới = ++counter.
  idSeq?: { q: number; e: number; r: number; l?: number };
  // Prompt sinh kịch bản video — sửa trong Cài đặt → Agents. Rỗng = dùng VIDEO_PROMPT mặc định (src/lib/video-prompt.ts).
  videoPrompt?: string;
}

export const FORMAT_AGENT: Record<AssetFormat, string> = {
  text: "Soạn giả Văn bản", worksheet: "Soạn giả Phiếu học tập", slide: "Đạo diễn Slide", quiz: "Chuyên gia Khảo thí",
  mindmap: "Kiến trúc sư Sơ đồ", flashcard: "Chuyên gia Ghi nhớ", podcast: "Biên kịch Podcast", video: "Đạo diễn Video hoạt hình",
};

export const STATUS_LABEL: Record<PkgStatus, string> = {
  draft_ai: "Nháp AI", edited: "Đã biên soạn", pending_review: "Chờ duyệt", approved: "Chuẩn trường",
};
export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  ready: "Sẵn sàng", generating: "Đang sinh", failed: "Lỗi", outdated: "Cần cập nhật",
};
export const FORMAT_LABEL: Record<AssetFormat, string> = {
  text: "Bài đọc", worksheet: "Phiếu học tập", slide: "Slide", quiz: "Quiz",
  mindmap: "Mindmap", flashcard: "Flashcard", podcast: "Podcast", video: "Video",
};
// Tên icon lucide-react (kebab → PascalCase tra ở component)
export const FORMAT_ICON: Record<AssetFormat, string> = {
  text: "FileText", worksheet: "PencilLine", slide: "Presentation", quiz: "ListChecks",
  mindmap: "Network", flashcard: "Layers", podcast: "Mic", video: "Clapperboard",
};
export const LEVEL_LABEL: Record<number, string> = { 1: "Nhận biết", 2: "Thông hiểu", 3: "Vận dụng" };

// Thư viện MẪU trình bày slide — dùng chung cho bộ chọn (client) và renderer (server, kèm bảng màu).
// Thêm mẫu = thêm 1 mục Ở ĐÂY + 1 bảng màu trong scripts/gen-themes.ts + thumbnail public/templates/<id>.png.
export interface SlideTemplate { id: string; label: string; desc: string; dark?: boolean }
export const SLIDE_TEMPLATES: SlideTemplate[] = [
  { id: "va-green", label: "Xanh brand", desc: "Xanh lá + đồng brass, học thuật — mặc định." },
  { id: "va-minimal", label: "Tối giản trang nhã", desc: "Nền sáng, ít màu, nhiều khoảng trắng." },
  { id: "va-editorial", label: "Biên tập nghiêm túc", desc: "Chữ nén in hoa, nền giấy — Lịch sử, Địa lý." },
  { id: "va-ocean", label: "Xanh biển hiện đại", desc: "Xanh dương tươi, sạch, hiện đại." },
  { id: "va-night", label: "Trình chiếu tối", desc: "Nền tối tương phản cao — phòng lớn.", dark: true },
  { id: "va-chalk", label: "Bảng xanh học đường", desc: "Tông bảng phấn, thân thiện lớp học.", dark: true },
  { id: "va-bloom", label: "Hoạt hình dễ thương", desc: "Chữ tròn, kem-xanh, chấm bi — vui mắt." },
  { id: "va-kids", label: "Thiếu nhi", desc: "Tím · cam tươi, bo tròn — cho tiểu học." },
];
export const ROLE_LABEL: Record<Role, string> = { teacher: "Giáo viên", lead: "Tổ trưởng", admin: "Quản trị học thuật", principal: "Ban giám hiệu" };
export const FIELD_LABEL: Record<keyof PkgFields, string> = {
  objective: "Mục tiêu học tập", explanation: "Giải thích", example: "Ví dụ", counterExample: "Phản ví dụ",
  commonMistake: "Lỗi thường gặp", strategy: "Chiến lược dạy", questions: "Ngân hàng câu hỏi gốc",
};
export const PKG_STATUS_COLOR: Record<PkgStatus, string> = {
  draft_ai: "bg-warn-bg text-warn border border-warn-line",
  edited: "bg-info-bg text-info border border-info-line",
  pending_review: "bg-brass-bg text-brass-ink border border-brass-line",
  approved: "bg-ok-bg text-ok border border-ok-line",
};
export const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  ready: "bg-ok-bg text-ok border border-ok-line",
  generating: "bg-info-bg text-info border border-info-line",
  failed: "bg-danger-bg text-danger border border-danger-line",
  outdated: "bg-warn-bg text-warn border border-warn-line",
};
export const LEVEL_COLOR: Record<number, string> = {
  1: "bg-lv1-bg text-lv1",
  2: "bg-lv2-bg text-lv2",
  3: "bg-lv3-bg text-lv3",
};

// ── Nhãn/màu cho phân loại nguyên tử & đồ thị ──
export const ATOM_TYPE_LABEL: Record<AtomType, string> = {
  KN: "Khái niệm", QT: "Quy tắc / Định lí", KY: "Kỹ năng", VD: "Vận dụng",
};
export const ATOM_TYPE_COLOR: Record<AtomType, string> = {
  KN: "bg-info-bg text-info", QT: "bg-brass-bg text-brass-ink", KY: "bg-brand-bg text-brand-ink", VD: "bg-lv3-bg text-lv3",
};
export const RELATION_LABEL: Record<EdgeRelation, string> = {
  prerequisite_hard: "Tiên quyết", related_soft: "Bổ trợ", misconception: "Dễ lẫn",
};
// màu vẽ cạnh trong đồ thị (SVG dùng hex)
export const RELATION_HEX: Record<EdgeRelation, string> = {
  prerequisite_hard: "#C0553B", related_soft: "#4F93A8", misconception: "#C79A2E",
};
export const RELATION_COLOR: Record<EdgeRelation, string> = {
  prerequisite_hard: "bg-danger-bg text-danger", related_soft: "bg-info-bg text-info", misconception: "bg-warn-bg text-warn",
};
export const COVER3_LABEL: Record<Cover3, string> = {
  empty: "Chưa có kiến thức", partial: "Thiếu — cần bổ sung", full: "Đủ",
};
// hex cho tô node/ô heatmap (đỏ · cam · xanh)
export const COVER3_HEX: Record<Cover3, string> = {
  empty: "#D1503F", partial: "#D9902E", full: "#2E9C6A",
};

// ── Chia trục biểu đồ theo "vạch đẹp": bước 1/2/2.5/5 ×10ⁿ, đỉnh trục làm tròn LÊN theo bước —
//    hết cảnh giá trị 12 lơ lửng giữa hai vạch 5 hay nhãn lẻ 3.25/6.5. Dữ liệu trường học đa số
//    nguyên → bỏ bước 2.5 khi bước không nguyên. Dùng chung: ChartSvg web, SVG export, trục pptx. ──
export function niceTicks(minV: number, maxV: number, target = 7): { ticks: number[]; lo: number; hi: number; step: number } {
  if (!Number.isFinite(minV)) minV = 0;
  if (!Number.isFinite(maxV)) maxV = 1;
  if (maxV <= minV) maxV = minV + 1;
  const span = maxV - minV;
  const pow = Math.pow(10, Math.floor(Math.log10(span / target)));
  const allInt = Number.isInteger(minV) && Number.isInteger(maxV);
  let step = pow * 10;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = m * pow;
    if (allInt && !Number.isInteger(s)) continue;
    if (span / s <= target) { step = s; break; }
  }
  const lo = Math.floor(minV / step) * step;
  const hi = Math.ceil(maxV / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.abs(t) < 1e-9 ? 0 : +t.toFixed(10));
  return { ticks, lo, hi, step };
}

// ── LaTeX → chữ đọc được (chạy cả trên canvas lẫn HTML, không cần thư viện) ──
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", a: "ᵃ", b: "ᵇ", x: "ˣ", y: "ʸ", k: "ᵏ", m: "ᵐ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", n: "ₙ", o: "ₒ", x: "ₓ", t: "ₜ", k: "ₖ", m: "ₘ" };
// ĐƯỢC CẢ CỤM HOẶC KHÔNG CHUYỂN: Unicode không có mọi chữ ở dạng mũ/chỉ số. Chuyển từng ký tự một thì
// S_{xq} ra "Sₓq" (nửa chỉ số — đọc thành S chỉ số x rồi chữ q) và S_{đáy} ra "Sđáy" (mất hẳn chỉ số,
// thành một từ). Không đủ ký tự thì giữ nguyên dấu _ / ^ để người đọc còn biết đó là chỉ số.
// \x03/\x04 = dấu ^ và _ ĐƯỢC GIỮ CÓ CHỦ Ý — đánh dấu tạm để dòng dọn "dấu mũ trơ" phía dưới
// không xoá nhầm chúng; trả lại ký tự thật ở bước cuối.
const mapAll = (s: string, tbl: Record<string, string>, mark: string) =>
  [...s].every((c) => tbl[c]) ? [...s].map((c) => tbl[c]).join("") : mark + s;
const toSup = (s: string) => mapAll(s, SUP, "\x03");
const toSub = (s: string) => mapAll(s, SUB, "\x04");
const MB: Record<string, string> = { N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" };
const MATH_SYM: [RegExp, string][] = [
  [/\\neq/g, "≠"], [/\\leq|\\le\b/g, "≤"], [/\\geq|\\ge\b/g, "≥"], [/\\pm/g, "±"], [/\\mp/g, "∓"],
  [/\\cdot/g, "·"], [/\\times/g, "×"], [/\\div/g, "÷"], [/\\ast/g, "∗"], [/\\circ/g, "∘"],
  [/\\notin/g, "∉"], [/\\in(?![a-zA-Z])/g, "∈"],   // chặn ăn nhầm "\infty" → "∈fty" [/\\subseteq/g, "⊆"], [/\\subset/g, "⊂"], [/\\cup/g, "∪"], [/\\cap/g, "∩"], [/\\emptyset|\\varnothing/g, "∅"],
  [/\\Delta/g, "Δ"], [/\\delta/g, "δ"], [/\\alpha/g, "α"], [/\\beta/g, "β"], [/\\gamma/g, "γ"], [/\\theta/g, "θ"], [/\\lambda/g, "λ"], [/\\mu/g, "µ"], [/\\pi/g, "π"], [/\\varphi|\\phi/g, "φ"], [/\\omega/g, "ω"],
  // Thiếu chữ Hy Lạp nào là chữ đó bị dòng dọn cuối XOÁ, để lại mũ trơ: \sigma^2 (phương sai) từng ra "²".
  [/\\Sigma/g, "Σ"], [/\\sum/g, "∑"], [/\\prod/g, "∏"], [/\\sigma/g, "σ"], [/\\rho/g, "ρ"], [/\\tau/g, "τ"],
  [/\\varepsilon|\\epsilon/g, "ε"], [/\\eta/g, "η"], [/\\nu/g, "ν"], [/\\xi/g, "ξ"], [/\\kappa/g, "κ"], [/\\chi/g, "χ"], [/\\psi/g, "ψ"], [/\\zeta/g, "ζ"],
  [/\\Omega/g, "Ω"], [/\\Gamma/g, "Γ"], [/\\Lambda/g, "Λ"], [/\\Phi/g, "Φ"], [/\\Theta/g, "Θ"], [/\\Pi/g, "Π"],
  [/\\partial/g, "∂"], [/\\nabla/g, "∇"], [/\\forall/g, "∀"], [/\\exists/g, "∃"], [/\\equiv/g, "≡"], [/\\propto/g, "∝"], [/\\cong/g, "≅"], [/\\wedge|\\land/g, "∧"], [/\\vee|\\lor/g, "∨"], [/\\prime/g, "′"],
  [/\\(?:overline|bar|widebar)\s*\{([^{}]*)\}/g, "$1̄"],   // \overline{x} → x̄ (số trung bình)
  // TÊN HÀM phải giữ lại: dòng dọn cuối xoá mọi \lệnh còn sót, nên thiếu ở đây là \sin^2\alpha ra "²α".
  // Dài trước ngắn (arcsin trước sin, sinh trước sin) — regex thay theo thứ tự nhánh đầu tiên khớp.
  // (?![a-zA-Z]) chứ KHÔNG dùng \b: \b coi "_" là ký tự từ nên "\log_2" sẽ không khớp → mất chữ "log".
  [/\\(arcsin|arccos|arctan|arccot|sinh|cosh|tanh|coth|sin|cos|tan|cot|sec|csc|log|ln|lg|exp|lim|sup|inf|max|min|gcd|lcm|deg|det|dim|mod)(?![a-zA-Z])/g, "$1"],
  [/\\infty/g, "∞"], [/\\Rightarrow/g, "⇒"], [/\\Leftrightarrow/g, "⇔"], [/\\rightarrow|\\to/g, "→"], [/\\leftarrow/g, "←"], [/\\ldots|\\dots|\\cdots/g, "…"], [/\\approx/g, "≈"], [/\\sim/g, "∼"], [/\\angle/g, "∠"], [/\\perp/g, "⊥"], [/\\parallel/g, "∥"], [/\\vec\s*\{([^{}]*)\}/g, "$1⃗"],
];
// Phân số: KHÔNG dùng regex — tử/mẫu có thể lồng ngoặc (\dfrac{-b\pm\sqrt{\Delta}}{2a}, \dfrac{\text{cạnh đối}}{\text{cạnh huyền}}),
// mà regex [^{}]* thì tịt ở ca lồng và im lặng nuốt luôn dấu "/" → "cạnh đốicạnh huyền". Đọc ngoặc cân bằng thì đúng mọi ca.
function readBrace(s: string, i: number): { body: string; end: number } | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}
function expandFrac(t: string): string {
  t = t.replace(/\\[dt]?frac\s*(\d)\s*(\d)/g, "$1/$2");        // dạng gọn \frac12
  const RE = /\\[dt]?frac\s*(?=\{)/;
  for (let guard = 0; guard < 40; guard++) {                    // lặp: \frac lồng trong \frac sẽ được xử ở vòng sau
    const m = RE.exec(t);
    if (!m) break;
    const a = readBrace(t, m.index + m[0].length);
    if (!a) break;
    let j = a.end;
    while (t[j] === " ") j++;
    const b = readBrace(t, j);
    if (!b) break;
    // thêm ngoặc khi tử/mẫu không phải một khối liền — kể cả khi nó lại là một phân số (\frac lồng),
    // vì "1/2/3" là mơ hồ.
    const wrap = (x: string) => (/[+\-±·×÷/^_\s]|\\[dt]?frac/.test(x) ? `(${x})` : x);
    t = t.slice(0, m.index) + wrap(a.body) + "/" + wrap(b.body) + t.slice(b.end);
  }
  return t;
}

// Dấu ranh giới mũ/chỉ số cho chế độ `marks` — web dịch tiếp thành <sup>/<sub> THẬT (mọi chữ đều hạ/nâng
// được, kể cả tiếng Việt: S_đáy). Bản chữ thường (mặc định) vẫn dùng ký tự Unicode vì PDF/podcast/SVG
// chỉ nhận chuỗi, không nhận thẻ HTML.
export const SUP_OPEN = "\x0E", SUP_CLOSE = "\x0F", SUB_OPEN = "\x10", SUB_CLOSE = "\x11";

export function readableMath(s?: string | null, opts?: { marks?: boolean }): string {
  if (!s) return s || "";
  const marks = !!opts?.marks;
  let t = String(s);
  t = t.replace(/\\\{/g, "\x01").replace(/\\\}/g, "\x02"); // GIỮ ngoặc TẬP HỢP \{1;2;3\} (khác ngoặc nhóm LaTeX sẽ bị bỏ)
  t = t.replace(/\\[()[\]]/g, ""); // bỏ \( \) \[ \]
  t = t.replace(/\\begin\{cases\}/g, "").replace(/\\end\{cases\}/g, "").replace(/\\\\/g, "; ");
  // Bóc \text{…}/\mathrm{…} TRƯỚC phân số: regex phân số chỉ nhận tử/mẫu KHÔNG có ngoặc lồng, mà
  // \dfrac{\text{cạnh đối}}{\text{cạnh huyền}} lại lồng ngoặc → không khớp → mất luôn dấu "/" (ra "cạnh đốicạnh huyền").
  t = t.replace(/\\(?:text|textbf|textit|mathrm|mathbf|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g, "$1");
  t = expandFrac(t);
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)").replace(/\\sqrt/g, "√");
  t = t.replace(/\\mathbb\s*\{([A-Z])\}/g, (_, c) => MB[c] || c);
  // ĐỘ: 0^\circ / 30^{\circ} / 45^o → 0°. Phải làm TRƯỚC mũ, vì "°" không nâng lên số mũ được
  // (toSup chỉ biết chữ-số) nên nếu để \circ thành "∘" rồi mới gặp "^" thì "^" đứng trơ ra: "0^∘".
  t = t.replace(/\^\s*\{?\s*(?:\\circ|\\degree|o|O)\s*\}?(?![a-zA-Z0-9])/g, "°");
  // Ký hiệu TRƯỚC, mũ/chỉ số SAU: nếu ngược lại thì lệnh nằm trong {…} của mũ/chỉ số (vd \lim_{x \to 0})
  // bị bẻ thành ký tự rời rồi mới bị dòng dọn cuối xoá — ra rác.
  for (const [re, v] of MATH_SYM) t = t.replace(re, v);
  const sup = marks ? (x: string) => SUP_OPEN + x + SUP_CLOSE : toSup;
  const sub = marks ? (x: string) => SUB_OPEN + x + SUB_CLOSE : toSub;
  t = t.replace(/\^\{([^{}]*)\}/g, (_, x) => sup(x)).replace(/\^(-?[0-9a-zA-Z])/g, (_, x) => sup(x));
  // _{max} có ngoặc → cả cụm. _max KHÔNG ngoặc: LaTeX chỉ subscript 1 ký tự ("m") → ra "Fₘax" lệch cỡ.
  // Vá: _ + CỤM CHỮ (≥2) → subscript cả cụm (F_max→Fₘₐₓ đều tí); _2O vẫn để "2" tí, "O" thường (chuẩn hoá học).
  t = t.replace(/_\{([^{}]*)\}/g, (_, x) => sub(x))
       .replace(/_([a-zA-Z]{2,})/g, (_, x) => sub(x))
       .replace(/_(-?[0-9a-zA-Z])/g, (_, x) => sub(x));
  t = t.replace(/\^(?=[^\s]) ?/g, "");   // dấu mũ còn sót (mũ là ký hiệu không nâng được) — bỏ, đừng để "^∘"
  t = t.replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\qquad/g, " ").replace(/\\[a-zA-Z]+/g, "").replace(/[{}$]/g, "");
  t = t.replace(/\x01/g, "{").replace(/\x02/g, "}"); // trả lại ngoặc tập hợp
  t = t.replace(/\x03/g, "^").replace(/\x04/g, "_");  // trả lại mũ/chỉ số không có ký tự Unicode tương ứng
  // GỮ xuống dòng (nội dung nhiều dòng: giải thích, ví dụ…) — chỉ gộp khoảng trắng trong TỪNG dòng.
  return t.split("\n").map((ln) => ln.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
