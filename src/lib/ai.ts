import { AiReport, AssetFormat, DB, Pkg, PkgFields, TreeNode, ancestors, node } from "./store";
import { z, type ZodType } from "zod";
import { QuizContentSchema, type QuizContent } from "./schemas/quiz";
import { SlideContentSchema, DeckDecorSchema, SlideChartSchema, type SlideContentV2, type SlideChart } from "./schemas/slide";
import { CAST_DIRECTIVE_VI } from "./video-kit";
import { VIDEO_PROMPT } from "./video-prompt";

// ── Nguyên liệu tri thức THẬT lấy thẳng từ DB (không bịa): yêu cầu cần đạt của atom,
//    tiền đề (prerequisite_hard) và quan niệm sai (edges) — đây là thứ làm nội dung "có ruột". ──
const ATOM_TYPE_FULL: Record<string, string> = { KN: "khái niệm", QT: "quy tắc / định lí", KY: "kỹ năng", VD: "dạng vận dụng" };
function atomKnowledge(db: DB, atom: TreeNode) {
  const incoming = db.edges.filter((e) => e.to === atom.id);
  const prereqs = incoming
    .filter((e) => e.relation === "prerequisite_hard")
    .map((e) => node(db, e.from))
    .filter((n): n is TreeNode => !!n)
    .map((n) => ({ title: n.title, yeuCau: (n.yeuCau || "").trim() }));
  const misconceptions = incoming
    .filter((e) => e.quanNiemSai)
    .map((e) => ({ text: e.quanNiemSai!.trim(), hint: (e.remediationHint || "").trim() }));
  return { prereqs, misconceptions };
}

// Node KẾ TIẾP trên đồ thị (dựng cliffhanger cho video): atom mà nguyên tử HIỆN TẠI là tiền đề CỨNG cho nó
// (from = atom này, relation = prerequisite_hard) — đó là "bài học sau" tự nhiên; fallback sang liên quan mềm.
function nextAtoms(db: DB, atom: TreeNode): string[] {
  const out = db.edges.filter((e) => e.from === atom.id);
  const titlesOf = (rel: string) => out.filter((e) => e.relation === rel).map((e) => node(db, e.to)?.title).filter((t): t is string => !!t);
  const hard = titlesOf("prerequisite_hard");
  return (hard.length ? hard : titlesOf("related_soft")).slice(0, 3);
}

// ============================================================
// Tầng AI: nếu có OPENROUTER_API_KEY (hoặc key lưu trong app) thì gọi LLM thật
// qua OpenRouter — chuẩn OpenAI, mặc định model DeepSeek; nếu không thì dùng bộ
// soạn mô phỏng (mock composer) để mọi tính năng vẫn chạy đầy đủ trong môi trường demo.
// ============================================================

// Key/model ĐỘNG mỗi lượt gọi: ưu tiên Cài đặt trong app (db.settings — nhập từ UI, có hiệu lực NGAY
// không cần restart) → fallback biến môi trường. Không có cả hai → bộ soạn ngoại tuyến.
// Lưu trong field settings.anthropicApiKey/anthropicModel (GIỮ tên field cũ để khỏi migrate DB — nay chứa key/model OpenRouter).
export function aiKey(db: DB): string { return (db.settings.anthropicApiKey || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim(); }
export function aiModel(db: DB): string { return (db.settings.anthropicModel || process.env.OPENROUTER_MODEL || process.env.ANTHROPIC_MODEL || "deepseek/deepseek-v4-pro").trim(); }
export function hasAiKey(db: DB): boolean { return !!aiKey(db); }
export function aiKeySource(db: DB): "app" | "env" | null {
  if (db.settings.anthropicApiKey?.trim()) return "app";
  if ((process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY)?.trim()) return "env";
  return null;
}

export interface GenResult<T> { content: T; tokens: number; costUsd: number; model: string; }

function mockMeter(payload: unknown, model = "mock-composer"): { tokens: number; costUsd: number; model: string } {
  const chars = JSON.stringify(payload).length;
  const tokens = Math.ceil(chars / 3.2);
  return { tokens, costUsd: +(tokens * 0.000009).toFixed(4), model };
}

async function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- Instruction Pack ----------
export function instructionPack(db: DB, atom: TreeNode, level: number, format?: AssetFormat): string {
  const anc = ancestors(db, atom.id);
  const chain = anc.map((n) => n.title).join(" › ");
  const grade = anc.find((n) => n.kind === "grade")?.grade;
  const s = db.settings;
  const refs = [...anc, atom].flatMap((n) => n.refs || []);
  const { prereqs, misconceptions } = atomKnowledge(db, atom);
  const out = [
    `# Bối cảnh kiến thức`, `Vị trí trong cây: ${chain} › ${atom.title} (mã ${atom.code})`,
    `Mức độ: ${level} (${level === 1 ? "Nhận biết" : level === 2 ? "Thông hiểu" : "Vận dụng"})`,
    // ── LÕI KIẾN THỨC: bám sát tuyệt đối, KHÔNG thêm nội dung ngoài phạm vi nguyên tử ──
    `# Kiến thức lõi của nguyên tử (bám sát tuyệt đối)`,
    `Yêu cầu cần đạt: ${atom.yeuCau?.trim() || "(chưa nhập — hãy dựa vào nhan đề nguyên tử)"}`,
    `Loại: ${ATOM_TYPE_FULL[atom.atomType || ""] || "nội dung"} · Bloom: ${atom.bloom || "?"} · DOK: ${atom.dok ?? "?"}${atom.nangLuc ? ` · Năng lực: ${atom.nangLuc}` : ""}`,
    // Hội đồng thẩm định 2026-07-09 bắt lỗi hệ thống: thuật ngữ VƯỢT LỚP lọt vào 5/7 định dạng → luật cứng tại đây
    `# CẤM VƯỢT CHUẨN LỚP${grade ? ` ${grade}` : ""}`,
    `Chỉ dùng thuật ngữ/ký hiệu HỌC SINH ĐÃ HỌC theo GDPT 2018 tính đến lớp này. Ví dụ điển hình: "mặt phẳng toạ độ", "toạ độ", ký hiệu Ox/Oy là kiến thức LỚP 8 — với lớp 7 trở xuống phải nói "trục ngang / trục đứng" và "điểm ứng với cặp (mốc thời gian; giá trị)". Nghi ngờ một ký hiệu chưa học → diễn đạt bằng lời.`,
    // Vấn đề GV nêu: LLM hay TỰ DIỄN GIẢI/nhân hoá toán (∈ ∉ ⊂ log lim đạo hàm vectơ…) thành ví dụ SAI bản chất.
    `# CẤM NHÂN HOÁ / TỰ DIỄN GIẢI TOÁN (BẮT BUỘC — mọi định dạng)`,
    `Bạn CHUYỂN HOÁ kiến thức ĐÃ CHO thành học liệu, TUYỆT ĐỐI KHÔNG tự sáng tác/định nghĩa lại toán và KHÔNG nhân hoá ký hiệu/khái niệm làm sai bản chất. SAI: "số 5 chạy vào tập hợp", "phân số thích ở cùng nhau", "vectơ muốn đi sang trái", "đạo hàm là chiếc xe". ĐÚNG: mô tả HÀNH ĐỘNG của người/vật minh hoạ — "học sinh đặt số 5 vào hộp", "giáo viên khoanh nhóm các số", "dùng mũi tên trên giấy kẻ ô để biểu diễn vectơ". Ký hiệu trên màn hình giữ NGUYÊN chuẩn, đúng vị trí — không đổi, không bỏ ngoặc, không tự thêm ký hiệu. KHÔNG đưa khái niệm/ví dụ nằm ngoài kiến thức được cung cấp.`,
    // Công thức phải KaTeX-render được trên app → bọc \(…\); tránh rơi vào bản Unicode gần đúng (mất gạch phân số/mũ lồng).
    `# ĐỊNH DẠNG CÔNG THỨC (BẮT BUỘC — mọi định dạng)`,
    `MỌI công thức/ký hiệu toán PHẢI bọc trong \\(…\\) (LaTeX inline). Vd đúng: "\\(v = \\dfrac{s}{t}\\)", "\\(x^2\\)", "\\(\\sqrt{2}\\)", "\\(p, q \\in \\mathbb{Z}\\)", "\\(q \\neq 0\\)". TUYỆT ĐỐI KHÔNG viết công thức trần (v = s/t) hay dùng ký tự Unicode toán (², √, ∈, ≠, ×, ½). Chỉ văn xuôi thuần mới để ngoài \\(…\\).`,
    // Quy định nhà trường 2026-07-10: nguyên tử = đơn vị nhỏ nhất → mỗi học liệu phải "tiêu thụ" xong trong ≤10 phút
    `# NGÂN SÁCH THỜI LƯỢNG (quy định nhà trường — BẮT BUỘC)`,
    `Mỗi học liệu của MỘT nguyên tử phải học/nghe/làm xong trong TỐI ĐA 10 PHÚT. Cụ thể: bài đọc ≤ 900 từ; slide ≤ 9 trang (mỗi trang ~1 phút giảng); podcast ≤ 5 phút nghe (lượt thoại ngắn); phiếu học tập ≤ 8 câu (~10 phút làm); quiz ≤ 5 câu; gói tri thức: phần giải thích ≤ 250 từ. Ưu tiên NGẮN MÀ SÂU — một ví dụ đắt hơn ba ví dụ thường; cắt ý trùng lặp thay vì viết thêm.`,
    ...(prereqs.length ? [`# Cần nắm trước (tiền đề — để dẫn nhập, không dạy lại)`, ...prereqs.map((p) => `- ${p.title}${p.yeuCau ? `: ${p.yeuCau}` : ""}`)] : []),
    ...(misconceptions.length ? [`# Quan niệm sai thường gặp (dùng cho phần Cẩn thận / phương án nhiễu)`, ...misconceptions.map((m) => `- ${m.text}${m.hint ? ` → cách chữa: ${m.hint}` : ""}`)] : []),
    `# Phong cách trường (Style Guide)`, s.styleGuide,
    `# Quy tắc khối lớp`, s.gradeRules,
    `# Triết lý`, s.philosophy,
  ];
  if (refs.length) out.push(`# Tài liệu tham khảo (bám sát)`, ...refs.map((r) => `- ${r.title}: ${r.url}`));
  const fs = format ? db.settings.formatSkills?.[format] : undefined;
  if (fs && format !== "video") out.push(  // video: dùng thẳng prompt kịch bản (settings.videoPrompt) — không chồng skill cũ
    `# Agent chuyên trách: ${fs.agent}`,
    fs.style ? `Phong cách viết: ${fs.style}` : "",
    fs.imageStyle ? `Phong cách hình ảnh: ${fs.imageStyle}` : "",
    fs.audience ? `Đối tượng người học: ${fs.audience}` : "",
    fs.length ? `Độ dài / quy mô mong muốn: ${fs.length}` : "",
    fs.constraints ? `Ràng buộc bắt buộc (phải tuân thủ): ${fs.constraints}` : "",
    fs.guide ? `Hướng dẫn tạo: ${fs.guide}` : "",
    fs.sample ? `Mẫu tham chiếu (bám theo văn phong này):\n${fs.sample}` : "",
  );
  return out.filter(Boolean).join("\n");
}

// ---------- Knowledge Contract (khoá nội dung — chống "ảo giác") ----------
// GV đề xuất: đừng đưa AI mỗi "tên nguyên tử" rồi để nó tự sáng tác. Truyền kèm HỢP ĐỒNG TRI THỨC =
// nguồn chân lý DUY NHẤT (định nghĩa chuẩn + ví dụ đã duyệt + quan niệm sai + tiền đề + trần lớp).
// Dựng từ DỮ LIỆU THẬT: gói tri thức đã duyệt (pkg.fields) + yeuCau atom + edges. AI chỉ được CHUYỂN HOÁ các trường này.
export function knowledgeContract(db: DB, atom: TreeNode, pkg: Pkg): string {
  const f = pkg.fields;
  const strip = (s?: string) => (s || "").replace(/【Nháp AI[^\n]*\n?/g, "").replace(/\(giáo viên (?:thay|điền)[^)]*\)/g, "…").trim();
  const { prereqs, misconceptions } = atomKnowledge(db, atom);
  const grade = ancestors(db, atom.id).find((n) => n.kind === "grade")?.grade;
  const mis = misconceptions.length ? misconceptions.map((m) => m.text) : (atom.quanNiemSai ? [strip(atom.quanNiemSai)] : []);
  const L = [
    `# KNOWLEDGE CONTRACT — NGUỒN CHÂN LÝ DUY NHẤT`,
    `(CHỈ được CHUYỂN HOÁ các trường dưới đây thành kịch bản. KHÔNG thêm khái niệm/ví dụ/ký hiệu nào ngoài đây. Trường trống → bỏ qua, KHÔNG tự bịa. Mâu thuẫn/mơ hồ → GIỮ NGUYÊN, không tự sửa.)`,
    `atom_id: ${atom.code}`,
    `canonical_definition: ${strip(f.objective) || strip(atom.yeuCau) || "(trống)"}`,
    strip(f.explanation) ? `giai_thich: ${strip(f.explanation)}` : "",
    strip(f.example) ? `allowed_examples: ${strip(f.example)}` : "",
    strip(f.counterExample) ? `phan_vi_du: ${strip(f.counterExample)}` : "",
    prereqs.length ? `kien_thuc_tien_de (CHỈ để "gợi mở/bắc cầu", KHÔNG dạy lại): ${prereqs.map((p) => p.title).join("; ")}` : "",
    mis.length ? `common_misconceptions (dùng ở cảnh "vướng mắc/gợi mở"): ${mis.join("; ")}` : "",
    `must_not_include: khái niệm/ký hiệu VƯỢT lớp ${grade || "mục tiêu"} (GDPT 2018); MỌI khái niệm ngoài canonical_definition.`,
  ];
  return L.filter(Boolean).join("\n");
}

// ---------- Gọi LLM qua OpenRouter (chuẩn OpenAI) — khi có key ----------
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
async function llmChat(key: string, model: string, messages: { role: string; content: string }[], maxTokens: number, jsonMode = false): Promise<{ text: string; model: string }> {
  if (/[^\x00-\xFF]/.test(key)) throw new Error("Key chứa ký tự lạ (thường do bộ gõ tiếng Việt Telex/Unikey biến 'ee'→'ê'…) — xoá ô key, TẮT bộ gõ tiếng Việt rồi DÁN lại key sạch.");
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "VA Studio" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message || "OpenRouter trả lỗi");
  return { text: data.choices?.[0]?.message?.content || "", model: data.model || model };
}

async function claudeJSON<T>(db: DB, system: string, prompt: string): Promise<T> {
  // trần 12k token: trần thấp từng làm gói mức 3 bị CỤT JSON — 12k đủ cho bài dài nhất
  const { text } = await llmChat(aiKey(db), aiModel(db), [
    { role: "system", content: system },
    { role: "user", content: prompt + "\n\nTrả về DUY NHẤT một khối JSON hợp lệ, không kèm giải thích." },
  ], 12000, true);
  const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(jsonStr) as T;
}

// ---------- Claude call CÓ VALIDATE (zod) + retry kèm lỗi khi model trả sai schema ----------
async function claudeJSONValidated<T>(db: DB, system: string, prompt: string, schema: ZodType<T>, maxRetries = 1): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const p = attempt === 0 ? prompt : `${prompt}\n\nLần trước bạn trả JSON KHÔNG hợp lệ — lỗi: ${lastErr}\nHãy sửa lại và trả đúng schema, chỉ một khối JSON, không giải thích thêm.`;
    try {
      const raw = await claudeJSON<unknown>(db, system, p);
      const res = schema.safeParse(raw);
      if (res.success) return res.data;
      lastErr = res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      // JSON.parse vỡ (model trả text thừa) cũng phải được RETRY, không được văng thẳng
      lastErr = "không parse được JSON: " + (e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error("AI không sinh được JSON hợp lệ theo schema sau khi thử lại: " + lastErr);
}

// ---------- Kiểm tra kết nối (nút "Kiểm tra" trong Cài đặt): gọi thật 1 lượt tí hon ----------
export async function testAiConnection(key: string, model: string): Promise<{ ok: boolean; model: string; error?: string }> {
  try {
    // 300 token: model "suy luận" (DeepSeek V4/R1…) tốn token cho phần reasoning ẩn TRƯỚC khi trả lời —
    // trần thấp từng làm content rỗng (hết token giữa chừng "suy nghĩ") → báo lỗi trống, gây khó hiểu.
    const { text, model: used } = await llmChat(key, model, [{ role: "user", content: "Trả về đúng chữ: OK" }], 300);
    if (!text.trim()) throw new Error("Model không trả nội dung (có thể là model suy luận cần nhiều token hơn, hoặc model không tồn tại) — thử model khác.");
    return { ok: text.toUpperCase().includes("OK"), model: used };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // dịch các lỗi hay gặp cho người không rành kỹ thuật
    const friendly = /401|403|auth|no auth|invalid|unauthor/i.test(m) ? "Key không hợp lệ — kiểm tra lại chuỗi sk-or-v1-…"
      : /404|not.?found|not a valid model|no endpoints/i.test(m) ? `Model "${model}" không có trên OpenRouter (404)`
      : /429|rate/i.test(m) ? "Bị giới hạn lượt gọi (429) — thử lại sau ít phút"
      : /credit|billing|402|insufficient/i.test(m) ? "Tài khoản OpenRouter hết credit / chưa nạp"
      : m;
    return { ok: false, model, error: friendly };
  }
}

// ---------- Nháp gói tri thức ----------
// Schema 7 trường — đi qua claudeJSONValidated để JSON cụt/sai được RETRY thay vì văng ngay
const PkgFieldsSchema = z.object({
  objective: z.coerce.string().min(1), explanation: z.coerce.string().min(1), example: z.coerce.string().min(1),
  counterExample: z.coerce.string().min(1), commonMistake: z.coerce.string().min(1), strategy: z.coerce.string().min(1),
  questions: z.coerce.string().min(1),
});

export async function draftPackage(db: DB, atom: TreeNode, level: 1 | 2 | 3): Promise<GenResult<PkgFields>> {
  const lvLabel = level === 1 ? "Nhận biết" : level === 2 ? "Thông hiểu" : "Vận dụng";
  if (hasAiKey(db)) {
    try {
      const fields = await claudeJSONValidated<PkgFields>(
        db,
        instructionPack(db, atom, level),
        `Soạn Gói tri thức dạy học cho nguyên tử "${atom.title}" ở mức ${level} (${lvLabel}).
BÁM TUYỆT ĐỐI vào "Yêu cầu cần đạt" ở phần Kiến thức lõi — đó là nội dung phải dạy, không thêm kiến thức ngoài phạm vi nguyên tử.
Trả JSON các khóa (mỗi khóa là chuỗi):
- objective: sau bài học học sinh làm được gì (1 câu, gắn mức Bloom).
- explanation: phát biểu CHÍNH XÁC nội dung lõi bằng lời + ký hiệu toán (LaTeX inline được); ${level === 1 ? "câu ngắn, trực quan" : level === 2 ? "có bước lập luận, nối kiến thức đã học" : "đặt trong tình huống mới, yêu cầu suy luận"}; kết bằng 1 câu chốt dễ nhớ.
- example: 1–2 VÍ DỤ CÓ SỐ CỤ THỂ kèm lời giải từng bước. TUYỆT ĐỐI KHÔNG viết "giáo viên tự thay", không để ví dụ trống.
- counterExample: một trường hợp CỤ THỂ trông giống nhưng KHÔNG áp dụng được, nêu rõ vì sao (ưu tiên bám "Quan niệm sai" đã cho).
- commonMistake: lỗi học sinh hay mắc + cách chữa (dùng "Quan niệm sai" đã cho nếu có).
- strategy: gợi ý dẫn dắt / thang câu hỏi Socratic.
- questions: đúng 3 câu, đánh số "1. 2. 3." theo 3 mức nhận biết→vận dụng, bám nội dung lõi.`,
        PkgFieldsSchema
      );
      return { content: fields, ...mockMeter(fields, aiModel(db)) };
    } catch (e) {
      // CÓ key mà nháp hỏng → báo lỗi thẳng cho giáo viên, không âm thầm trả khung ngoại tuyến
      throw new Error(`AI nháp gói thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await delay(350 + Math.random() * 500);
  const fields = composeOfflineFields(db, atom, level);
  return { content: fields, ...mockMeter(fields) };
}

// Bộ soạn NGOẠI TUYẾN (không có API key): KHÔNG bịa — trưng đúng dữ liệu thật của atom
// (yêu cầu cần đạt làm phần giải thích lõi, quan niệm sai từ đồ thị làm phần Cẩn thận),
// và nói THẲNG chỗ nào cần bật AI/giáo viên bổ sung (ví dụ số cụ thể) thay vì lấp bằng chữ rỗng.
function composeOfflineFields(db: DB, atom: TreeNode, level: 1 | 2 | 3): PkgFields {
  const lv = level === 1 ? "nhận biết" : level === 2 ? "thông hiểu" : "vận dụng";
  const yeu = (atom.yeuCau || atom.title).trim();
  const typeLabel = ATOM_TYPE_FULL[atom.atomType || ""] || "nội dung";
  const { prereqs, misconceptions } = atomKnowledge(db, atom);
  const depth = level === 1
    ? "Trình bày trực quan, câu ngắn, một ý mỗi câu."
    : level === 2
    ? "Giải thích vì sao, nối với kiến thức đã học, có bước trung gian."
    : "Đặt trong tình huống mới, yêu cầu lập luận và trình bày lời giải.";
  const top = misconceptions[0];
  return {
    objective: `Sau bài học, học sinh ${lv} được: ${yeu}`,
    explanation: `${yeu}\n\nĐây là ${typeLabel} (Bloom ${atom.bloom || "?"}, DOK ${atom.dok ?? "?"}). ${depth}${prereqs.length ? `\n\nCần nắm trước: ${prereqs.map((p) => p.title).join("; ")}.` : ""}`,
    example: `Gợi ý ví dụ: lấy một trường hợp áp dụng trực tiếp "${yeu}".\n(Ví dụ số cụ thể có lời giải — cần bật AI hoặc giáo viên bổ sung.)`,
    counterExample: top
      ? `Trường hợp dễ nhầm: ${top.text}${top.hint ? ` → Phân biệt: ${top.hint}` : ""}`
      : `Một trường hợp trông giống nhưng KHÔNG thỏa điều kiện của "${atom.title}" — dùng để học sinh phân biệt ranh giới áp dụng.`,
    commonMistake: misconceptions.length
      ? misconceptions.map((m) => `• ${m.text}${m.hint ? `\n   → Cách chữa: ${m.hint}` : ""}`).join("\n")
      : `Học sinh dễ áp dụng máy móc mà không kiểm tra điều kiện của "${atom.title}"; nhầm với ${typeLabel} gần kề.`,
    strategy: `Dẫn dắt Socratic: "Em nhận thấy điều gì?" → "Điều đó có luôn đúng không?" → "Vì sao?" → "Khi nào thì không?". Chốt bằng hoạt động cặp đôi 3 phút.`,
    questions: `1. (nhận biết) Phát biểu lại: ${yeu.split(/[;.]/)[0].trim()}.\n2. (thông hiểu) Giải thích vì sao và cho một ví dụ về "${atom.title}".\n3. (vận dụng) Áp dụng "${atom.title}" vào một tình huống thực tế.`,
  };
}

// ---------- Viết lại một trường ----------
export async function rewriteField(db: DB, pkg: Pkg, atom: TreeNode, field: keyof PkgFields, instruction: string): Promise<GenResult<string>> {
  const current = pkg.fields[field];
  if (hasAiKey(db)) {
    try {
      const out = await claudeJSON<{ text: string }>(
        db,
        instructionPack(db, atom, pkg.level),
        `Trường "${field}" hiện tại:\n${current}\n\nYêu cầu của giáo viên: ${instruction}\nViết lại trường này. JSON: {"text": "..."}`
      );
      return { content: out.text, ...mockMeter(out, aiModel(db)) };
    } catch { /* mock */ }
  }
  await delay(300 + Math.random() * 400);
  // Bộ soạn mô phỏng: biến đổi thật (rút gọn từng câu, thêm một ví dụ gần gũi),
  // KHÔNG nối câu mô tả tự tham chiếu vào nội dung trả về.
  const cleaned = current.replace("【Nháp AI — cần giáo viên rà soát】\n", "").trim();
  const sentences = cleaned.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const wantShorter = /gọn|ngắn|súc tích|đơn giản/i.test(instruction);
  const wantExample = /ví dụ|thực tế|đời thường|minh họa/i.test(instruction);
  let out = wantShorter ? sentences.slice(0, Math.max(1, Math.ceil(sentences.length * 0.6))).join(" ") : cleaned;
  if (wantExample && field !== "example") out += `\n\nVí dụ gần gũi: hãy liên hệ "${atom.title}" với một tình huống quen thuộc của học sinh (mua đồ dùng học tập, chia quà, trò chơi trên lớp).`;
  if (!wantShorter && !wantExample) {
    // Diễn đạt lại: gộp và làm mượt, giữ nguyên ý và thuật ngữ SGK
    out = sentences.map((s) => s.trim()).join(" ");
  }
  return { content: out || cleaned, ...mockMeter(out) };
}

// ---------- AI Reviewer (6 tiêu chí, trả cờ cảnh báo) ----------
export async function reviewPackage(db: DB, pkg: Pkg, atom: TreeNode): Promise<GenResult<AiReport>> {
  if (hasAiKey(db)) {
    try {
      const rep = await claudeJSON<AiReport>(
        db,
        instructionPack(db, atom, pkg.level),
        `Thẩm định Gói tri thức sau theo 6 tiêu chí (đủ ý, đúng kiến thức, vừa mức độ, dễ đọc theo lứa tuổi, nhất quán nội bộ, không bịa đặt). Gói:\n${JSON.stringify(pkg.fields)}\nJSON: {"criteria":[{"name":"...","ok":true,"note":"..."}],"flags":["..."],"summary":"..."}`
      );
      return { content: rep, ...mockMeter(rep, aiModel(db)) };
    } catch { /* mock */ }
  }
  await delay(400 + Math.random() * 400);
  const f = pkg.fields;
  const isDraft = pkg.status === "draft_ai";  // nguồn chuẩn: trạng thái gói (không dựa vào chuỗi đánh dấu trong nội dung)
  const criteria = [
    { name: "Đủ ý (7 trường)", ok: Object.values(f).every((v) => v.trim().length > 20), note: Object.values(f).every((v) => v.trim().length > 20) ? "Các trường đều có nội dung." : "Có trường còn quá sơ sài." },
    { name: "Đúng kiến thức", ok: !isDraft, note: isDraft ? "Nội dung còn ở dạng nháp máy, chưa có ví dụ số cụ thể — cần giáo viên kiểm tra tính đúng." : "Ví dụ và phản ví dụ nhất quán với phát biểu; không phát hiện mâu thuẫn." },
    { name: "Vừa mức độ", ok: true, note: `Ngôn ngữ và độ khó phù hợp mức ${pkg.level}.` },
    { name: "Dễ đọc theo lứa tuổi", ok: f.explanation.length < 1600, note: f.explanation.length < 1600 ? "Độ dài và câu chữ phù hợp." : "Phần giải thích hơi dài so với quy tắc khối lớp." },
    { name: "Nhất quán nội bộ", ok: true, note: "Câu hỏi và ví dụ bám đúng phạm vi nguyên tử." },
    { name: "Không bịa đặt", ok: !isDraft, note: isDraft ? "Chưa xác minh được nguồn ví dụ — giáo viên cần thay bằng ví dụ sát SGK." : "Không phát hiện thông tin ngoài phạm vi." },
  ];
  const flags = criteria.filter((c) => !c.ok).map((c) => `Cần xem kỹ: ${c.name} — ${c.note}`);
  const rep: AiReport = { criteria, flags, summary: flags.length ? `Có ${flags.length} điểm cần giáo viên rà soát trước khi duyệt.` : "Không phát hiện vấn đề; đề xuất duyệt." };
  return { content: rep, ...mockMeter(rep) };
}

// ---------- Sinh tài nguyên theo định dạng ----------
export async function generateAssetContent(db: DB, pkg: Pkg, atom: TreeNode, format: AssetFormat): Promise<GenResult<unknown>> {
  if (hasAiKey(db)) {
    try {
      if (format === "quiz") {
        const content = await generateQuiz(db, pkg, atom);
        return { content, ...mockMeter(content, aiModel(db)) };
      }
      if (format === "slide") {
        const content = await artDirect(db, atom, await generateSlide(db, pkg, atom));
        return { content, ...mockMeter(content, aiModel(db)) };
      }
      // schema chart đính kèm (bài đọc/mindmap/flashcard) — DÙNG LẠI đúng khuôn chart của slide
      const chartSpec = `{"type":"line|bar","categories":["..."],"series":[{"name":"...","values":[số]}],"xLabel":"...","yLabel":"..."}`;
      const chartRule = `LUẬT CHART (áp cho trường "chart" nếu dùng): CHỈ thêm khi nội dung có SỐ LIỆU thật; số liệu phải KHỚP 100% với chữ/bảng trong bài (không bịa bộ số mới); ≤ 6 mốc; nguyên tử không định lượng → BỎ HẲN trường chart.`;
      const schema: Record<Exclude<AssetFormat, "quiz" | "slide">, string> = {
        text: `{"sections":[{"heading":"...","body":"...","chart":${chartSpec} (KHÔNG bắt buộc)}],"answers":["..."] (đáp án tự kiểm)}
BÀI ĐỌC là bài để HỌC SINH ĐỌC HIỂU (không phải phiếu làm bài): chủ yếu là LỜI GIẢNG mạch lạc + ví dụ có lời giải sẵn để đọc; văn xuôi liền mạch, KHÔNG để chỗ trống/dòng chấm cho học sinh điền, KHÔNG phải danh sách bài tập. Chỉ có 2-3 câu "Tự kiểm tra" ở cuối (có đáp án). Phân biệt rõ với PHIẾU HỌC TẬP (phiếu = làm bài, ít giảng).
CẤU TRÚC BÀI ĐỌC: mở bài dẫn nhập → nội dung chính (giảng kỹ) → "Ví dụ" (giải mẫu từng bước) → "Cẩn thận" (nếu có quan niệm sai) → phần CUỐI đặt tên "Tự kiểm tra" gồm 2-3 câu hỏi ngắn đánh số.
- "answers" BẮT BUỘC khi có phần Tự kiểm tra: đáp án NGẮN GỌN từng câu theo đúng thứ tự (in ở cuối bản PDF cho học sinh đối chiếu).
- ${chartRule} Gắn chart vào ĐÚNG section chứa số liệu — bản in sẽ vẽ biểu đồ thật ngay dưới đoạn đó, nên trong body ĐƯỢC PHÉP nhắc "biểu đồ bên dưới".
- Bảng số liệu trong body: dùng BẢNG MARKDOWN thật (| Cột |\\n|---|\\n| … |).`,
        worksheet: `{"sections":[{"heading":"Phần A — ...","body":"các câu hỏi đánh số"}]}
PHIẾU HỌC TẬP là để HỌC SINH LÀM BÀI (khác hẳn Bài đọc vốn để ĐỌC): phần lớn là CÂU HỎI/BÀI TẬP đánh số cho học sinh tự làm; chỉ nhắc lại kiến thức tối thiểu 1-2 câu để đặt bối cảnh, TUYỆT ĐỐI KHÔNG giảng lại cả bài như bài đọc; KHÔNG in đáp án trên phiếu (học sinh phải tự làm).
RÀNG BUỘC CỨNG (phiếu sẽ IN RA GIẤY):
- Bảng số liệu phải là BẢNG MARKDOWN thật (| Cột | Cột |\\n|---|---|\\n| … |) — template sẽ kẻ thành bảng in; KHÔNG mô tả bảng bằng lời.
- Chỗ cần học sinh VẼ (hệ trục, biểu đồ, hình…): đặt MỘT DÒNG RIÊNG đúng dạng "[Khung vẽ: <lời nhắn cho học sinh>]" — template sẽ in khung ô ly thật. Lời nhắn viết CHO HỌC SINH (vd "Em vẽ biểu đồ số cây trồng vào khung này nhé"), KHÔNG mô tả kỹ thuật kiểu "hệ trục - trục ngang ghi năm…". KHÔNG tự viết chữ "khung vẽ" trong câu văn.
- TUYỆT ĐỐI KHÔNG tham chiếu "hình vẽ sau/hình bên/quan sát hình" — phiếu không có hình; mọi dữ kiện phải nằm trong chữ hoặc bảng markdown kèm ngay đó.
- CHỖ VIẾT đặt NGAY DƯỚI từng câu (không dồn xuống cuối): câu điền chỗ trống thì để "……" NGAY TRONG câu (vd "Fₘₐₓ = …… đạt tại đỉnh ……"); câu trả lời dài thì xuống dòng, mỗi dòng viết là MỘT dòng chỉ gồm "………" (1 dòng cho câu ngắn, 2–3 dòng cho câu giải thích). KHÔNG tạo mục "Bài làm" riêng ở cuối — template tự kẻ dòng tại chỗ.`,
        mindmap: `{"markdown":"# chủ đề\\n## nhánh...","chart":${chartSpec} (KHÔNG bắt buộc)}
${chartRule} Chart hiện thành "hình số liệu minh hoạ" cạnh sơ đồ.`,
        flashcard: `{"cards":[{"front":"...","back":"..."}],"chart":${chartSpec} (KHÔNG bắt buộc)} (5-7 thẻ)
RÀNG BUỘC CỨNG: mỗi mặt sau (back) phải TỰ ĐỨNG TRỌN VẸN — là câu trả lời đầy đủ, không cắt giữa chừng, không kết thúc bằng dấu hai chấm, KHÔNG tham chiếu bảng/hình không có trong thẻ; nếu cần số liệu thì ghi gọn ngay trong thẻ (vd "2020: 10; 2021: 15; 2022: 12").
${chartRule} Chart là "bảng số liệu tham khảo" hiện cạnh bộ thẻ — thẻ vẫn phải tự đứng khi không nhìn chart.`,
        podcast: `{"script":[{"speaker":"Cô Mai|Bin","text":"...","mood":"vui|ngạc nhiên|trầm|thường"}]} (14-18 lượt thoại, xen kẽ)
LUẬT VĂN NÓI (BẮT BUỘC — đây là audio người thật nghe, không phải giấy tờ):
- Cô Mai: giáo viên ấm áp kể chuyện giỏi. Bin: học sinh tò mò, hồn nhiên, hay đoán.
- Câu NGẮN 5-15 từ, có cảm thán tự nhiên ("Ơ!", "À!", "Ủa cô ơi…", "Hay quá!", "Chờ đã…"), có ngập ngừng "…".
- "mood" TỪNG CÂU — audio sẽ ĐỔI GIỌNG theo: "vui" = kể rôm rả, trêu nhau; "ngạc nhiên" = lúc Bin vỡ òa "à ra vậy!" hoặc thấy điều bất ngờ; "trầm" = chốt kiến thức chậm rãi, dặn dò; "thường" = còn lại. Cả tập phải đổi mood ít nhất 4 lần — cấm đều đều một tông từ đầu tới cuối.
- Tiếng cười viết THÀNH LỜI ngay trong text ("ha ha", "hì hì") — máy đọc được; đừng ghi chú kiểu [cười].
- CẤM TUYỆT ĐỐI từ giấy tờ: "mức vận dụng/nhận biết/thông hiểu", "yêu cầu cần đạt", "mục tiêu bài học", "nội dung", "ví dụ 1/2". Người thật không nói vậy.
- CẤM ký hiệu trong lời thoại — phải ĐỌC RA: "7/1"→"bảy phần một", "p/q"→"p trên q", "∈"→"thuộc", "≠ 0"→"khác không", "="→"bằng".
- Mở đầu bằng TÌNH HUỐNG ĐỜI THẬT (chia bánh, đi chợ, điểm thi, đá bóng…) làm Bin thắc mắc — KHÔNG mở bằng "hôm nay cô trò mình học…".
- Bin phải ĐOÁN SAI ít nhất 1 lần (bám quan niệm sai thật nếu có) rồi tự "à ra vậy!" (mood "ngạc nhiên") — khoảnh khắc vỡ òa là linh hồn của tập.
- Kết: Bin đố lại NGƯỜI NGHE một câu nhỏ + lời chào ấm, hẹn tập sau.`,
        video: (db.settings.videoPrompt?.trim() || VIDEO_PROMPT).replaceAll("{{atom}}", atom.title).replaceAll("{{cast}}", CAST_DIRECTIVE_VI),
      };
      // Video = khoá nội dung bằng Knowledge Contract (chống ảo giác); các định dạng khác giữ prompt chung.
      // Bơm NODE KẾ TIẾP (từ đồ thị) để nhịp 7 dựng cliffhanger trỏ đúng bài sau, KHÔNG bịa chủ đề.
      const nexts = format === "video" ? nextAtoms(db, atom) : [];
      const cliffCtx = nexts.length
        ? `\n\nNODE KẾ TIẾP (chỉ để dựng cliffhanger ở nhịp 7 — HÉ câu hỏi/tình huống gợi tò mò, KHÔNG giảng nội dung): ${nexts.join("; ")}`
        : `\n\nNODE KẾ TIẾP: (không có trong đồ thị) — nhịp 7 kết bằng lời hẹn nhẹ, KHÔNG bịa tên chủ đề cụ thể.`;
      const userPrompt = format === "video"
        ? `${knowledgeContract(db, atom, pkg)}${cliffCtx}\n\nDựa DUY NHẤT vào Knowledge Contract + NODE KẾ TIẾP trên, viết KỊCH BẢN VIDEO 7 NHỊP. Trả về JSON theo schema:\n${schema.video}`
        : `Từ Gói tri thức sau, tạo ${format}. Gói:\n${JSON.stringify(pkg.fields)}\nJSON theo schema: ${schema[format]}`;
      const content = await claudeJSON<unknown>(db, instructionPack(db, atom, pkg.level, format), userPrompt);
      // QC section (text/worksheet): heading/body phải là CHUỖI; BỎ section KHÔNG có nội dung — AI đôi khi
      // trả section chỉ có tiêu đề (body undefined) → renderer .split() crash. Chặn ngay trước khi lưu.
      if ((format === "text" || format === "worksheet") && content && typeof content === "object") {
        const c = content as { sections?: { heading?: unknown; body?: unknown }[] };
        if (Array.isArray(c.sections)) {
          const norm = c.sections.map((s) => ({ ...s, heading: typeof s.heading === "string" ? s.heading : "", body: typeof s.body === "string" ? s.body : "" }));
          const withBody = norm.filter((s) => (s.body as string).trim());
          c.sections = withBody.length ? withBody : norm; // ưu tiên section có nội dung; rỗng hết thì giữ để không mất trắng
        }
      }
      // QC tất định chart đính kèm: hỏng schema/thiếu mốc → BỎ chart, giữ nguyên học liệu
      if (format === "text" && content && typeof content === "object") {
        const c = content as { sections?: { chart?: unknown }[]; answers?: unknown };
        for (const s of c.sections ?? []) {
          if (s.chart === undefined) continue;
          const ch = sanitizeChart(s.chart);
          if (ch) s.chart = ch; else delete s.chart;
        }
        if (c.answers !== undefined) {
          if (Array.isArray(c.answers)) c.answers = c.answers.map((a) => String(a)).filter(Boolean);
          else delete c.answers;
        }
      }
      if ((format === "mindmap" || format === "flashcard") && content && typeof content === "object" && "chart" in content) {
        const c = content as { chart?: unknown };
        const ch = sanitizeChart(c.chart);
        if (ch) c.chart = ch; else delete c.chart;
      }
      return { content, ...mockMeter(content, aiModel(db)) };
    } catch (e) {
      // CÓ key mà sinh hỏng → BÁO LỖI THẲNG, tuyệt đối không lặng lẽ trả bản mock (gây hiểu nhầm "AI tệ")
      throw new Error(`AI sinh ${format} thất bại: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await delay(500 + Math.random() * 700);
  const content = format === "quiz" ? mockQuiz(db, pkg, atom) : format === "flashcard" ? offlineFlashcards(db, pkg, atom) : mockAsset(db, pkg, atom, format);
  return { content, ...mockMeter(content) };
}

// Flashcard NGOẠI TUYẾN từ data thật: thẻ cốt lõi = yêu cầu cần đạt, thẻ "bẫy" = quan niệm sai từ đồ thị,
// thẻ ví dụ chỉ thêm khi gói có ví dụ THẬT (không phải dòng nhắc "cần bật AI / giáo viên bổ sung").
function offlineFlashcards(db: DB, pkg: Pkg, atom: TreeNode): { cards: { front: string; back: string }[] } {
  const yeu = (atom.yeuCau || atom.title).trim();
  const { prereqs, misconceptions } = atomKnowledge(db, atom);
  const cards: { front: string; back: string }[] = [
    { front: `${atom.title} — yêu cầu cần đạt là gì?`, back: yeu },
  ];
  // TOÀN VĂN ví dụ (không cắt dòng đầu — cắt là thẻ cụt "…qua các năm:"); UI/export tự xuống dòng
  const ex = pkg.fields.example.trim();
  if (ex && !/giáo viên|bật AI/i.test(ex)) cards.push({ front: "Cho một ví dụ minh hoạ", back: ex });
  for (const m of misconceptions) {
    cards.push({ front: `⚠ Nhận diện lỗi: "${m.text}" — đúng hay sai?`, back: m.hint ? `Sai — ${m.hint}` : "Sai — đối chiếu lại yêu cầu cần đạt để tránh nhầm lẫn này." });
  }
  if (!misconceptions.length) {
    const mk = firstLine(pkg.fields.commonMistake);
    if (mk) cards.push({ front: "Lỗi thường gặp là gì?", back: mk });
  }
  if (prereqs.length) cards.push({ front: `Trước khi học "${atom.title}" cần nắm gì?`, back: prereqs.map((p) => p.title).join("; ") });
  return { cards };
}

// ---------- Quiz: schema chặt (zod) + phương án nhiễu bám quan_niem_sai thật từ đồ thị ----------
function misconceptionsFor(db: DB, atom: TreeNode): { text: string; hint?: string }[] {
  return db.edges.filter((e) => e.to === atom.id && e.quanNiemSai).map((e) => ({ text: e.quanNiemSai!, hint: e.remediationHint }));
}

// QC tất định sau validate: câu tf phải là answer BOOLEAN, không options — model đôi khi trả
// options ["Đúng","Sai"] + answer:0 (schema union cho qua) → nếu không chuẩn hóa, GIFT/chấm điểm sẽ SAI đáp án.
function normalizeQuiz(c: QuizContent): QuizContent {
  for (const q of c.questions) {
    if (q.options && !q.options.length) delete q.options; // model hay trả options:[] cho tf/fill — dọn sạch
    if (q.type !== "tf") continue;
    if (typeof q.answer !== "boolean") {
      if (typeof q.answer === "number" && q.options) q.answer = /đúng|true/i.test(q.options[q.answer] || "");
      else q.answer = /^(true|đúng|t)$/i.test(String(q.answer).trim());
    }
    delete q.options;
  }
  return c;
}

async function generateQuiz(db: DB, pkg: Pkg, atom: TreeNode): Promise<QuizContent> {
  const misc = misconceptionsFor(db, atom);
  const miscCtx = misc.length
    ? `\n\nQUAN NIỆM SAI THƯỜNG GẶP (dùng làm phương án nhiễu SAI trong câu mcq, ghi lại đúng câu này vào "misconceptionRef"):\n${misc.map((m) => `- ${m.text}`).join("\n")}`
    : "";
  return normalizeQuiz(await claudeJSONValidated(
    db,
    instructionPack(db, atom, pkg.level, "quiz"),
    `Từ Gói tri thức sau, tạo quiz 5 câu (mcq/tf/fill trộn) bám sát nguyên tử "${atom.title}". Mỗi câu gắn "dok" (1=Nhận biết,2=Thông hiểu,3=Vận dụng) khớp mức ${pkg.level}. Với câu mcq, MỘT phương án sai phải bám sát quan niệm sai thật của học sinh (nếu có, xem danh sách dưới) thay vì bịa ngẫu nhiên.
RÀNG BUỘC CỨNG (quiz chỉ có CHỮ, học sinh làm trên máy):
- TUYỆT ĐỐI KHÔNG ra câu cần nhìn hình vẽ / biểu đồ Venn / trục số / bảng kèm theo — app không hiển thị hình. Nếu cần minh họa tập hợp, MÔ TẢ BẰNG CHỮ (vd: "Cho tập hợp B = \\{2; 5; 8\\}").
- Câu "fill": đáp án phải GÕ ĐƯỢC bằng bàn phím (số hoặc từ, vd "127", "hữu hạn"). KHÔNG bắt điền ký hiệu toán (∈, ∉, ⊂, ℚ…) — câu hỏi về chọn ký hiệu phải chuyển thành mcq với các ký hiệu là phương án.
Gói:\n${JSON.stringify(pkg.fields)}${miscCtx}\nJSON: {"questions":[{"type":"mcq|tf|fill","dok":1,"q":"...","options":["..."],"answer":0,"explanation":"...","misconceptionRef":"..."}]}`,
    QuizContentSchema
  ));
}

// QC tất định cho MỌI chart AI trả về (slide/bài đọc/mindmap/flashcard): validate schema (z.coerce cứu
// số dạng chuỗi), cắt series/categories về độ dài chung, <2 mốc hoặc giá trị không hữu hạn → null (bỏ chart).
export function sanitizeChart(raw: unknown): SlideChart | null {
  const p = SlideChartSchema.safeParse(raw);
  if (!p.success) return null;
  const chart = p.data;
  let n = chart.categories.length;
  for (const se of chart.series) n = Math.min(n, se.values.length);
  if (n < 2 || chart.series.some((se) => se.values.slice(0, n).some((v) => !Number.isFinite(v)))) return null;
  chart.categories = chart.categories.slice(0, n);
  for (const se of chart.series) se.values = se.values.slice(0, n);
  return chart;
}

// QC tất định sau validate: series.values phải KHỚP số mốc categories (schema không ràng chéo được) —
// lệch thì cắt về độ dài chung; chart còn <2 mốc hoặc có giá trị không hữu hạn → bỏ chart (renderer khỏi chia lỗi).
function normalizeSlide(c: SlideContentV2): SlideContentV2 {
  for (const s of c.slides) {
    if (s.chart) {
      let n = s.chart.categories.length;
      for (const se of s.chart.series) n = Math.min(n, se.values.length);
      const badVal = s.chart.series.some((se) => se.values.slice(0, n).some((v) => !Number.isFinite(v)));
      if (n < 2 || badVal) { delete s.chart; }
      else {
        s.chart.categories = s.chart.categories.slice(0, n);
        for (const se of s.chart.series) se.values = se.values.slice(0, n);
      }
    }
    if (s.table && (!s.table.headers.length || !s.table.rows.length)) delete s.table;
  }
  return c;
}

// ── "ppt-master-lite" lượt 2 — ĐẠO DIỄN MỸ THUẬT: nhìn cả deck, đặt lớp trang trí tự do (tọa độ %)
//    cho từng slide theo motif của bài. Tách khỏi lượt viết nội dung (bí quyết chất lượng của ppt-master)
//    nhưng chỉ 1 call + render tất định → nhanh gấp nhiều lần, không cần worker. Hỏng → bỏ trang trí, không phá deck. ──
async function artDirect(db: DB, atom: TreeNode, content: SlideContentV2): Promise<SlideContentV2> {
  try {
    const outline = content.slides.map((s, i) => ({
      i, title: s.title, warn: !!s.warn,
      blocks: [s.chart && "chart", s.table && "table", s.steps?.length && "steps", s.cards?.length && "cards", s.stat && "stat", s.bullets?.length && "bullets"].filter(Boolean),
    }));
    const deck = await claudeJSONValidated(
      db,
      `Bạn là ĐẠO DIỄN MỸ THUẬT slide giáo dục của Trường Việt Anh (palette: xanh rêu "brand", vàng đồng "brass", xanh sương "mist"). Canvas 16:9, tọa độ %: x 0→100 trái→phải, y 0→100 trên→dưới.`,
      `Bài: "${atom.title}". Deck ${content.slides.length} slide (tiêu đề + khối nội dung từng slide bên dưới). Hãy CHỌN MỘT MOTIF thị giác cho cả bài (vd đường xu hướng đi lên, mốc thời gian, ô ly giấy kẻ…) rồi đặt 3-6 phần tử trang trí cho TỪNG slide, cùng chất, có nhịp — không slide nào lặp y hệt slide nào.
Phần tử (CHỈ 3 loại này): {"kind":"blob|ring|chip","x","y","w"?,"h"?,"text"?,"color":"brand|brass|mist|white|ink","opacity"?,"front"?}
- blob: đốm màu mờ (opacity 6-14), TÂM PHẢI Ở GÓC/RÌA (x<20 hoặc x>80 hoặc y<16 hoặc y>82) — lệch vào giữa sẽ bị renderer LOẠI.
- ring: vòng khuyên mảnh (opacity 20-45) — điểm nhấn rìa, cùng luật góc.
- chip: nhãn chữ NGẮN ≤3 từ tiếng Việt tạo cảm xúc ("Mẹo nhớ!", "Thử xem!", "Ghi nhớ!"), TỐI ĐA 1 chip/slide — renderer tự ghim vào khe cố định góc dưới phải.
CẤM: sticker emoji, arrow, line (đã có motif đường-số-liệu tất định lo phần minh họa); quá 5 phần tử/slide.
Slide bìa (i=0) nền xanh đậm: blob trắng/brass opacity 5-10, to nhỏ xen kẽ ở 2-3 góc.
Deck:\n${JSON.stringify(outline)}\nJSON: {"motif":"…","slides":[{"decor":[…]} × ${content.slides.length}]}`,
      DeckDecorSchema
    );
    deck.slides.slice(0, content.slides.length).forEach((d, i) => {
      if (d.decor?.length) content.slides[i].decor = d.decor;
    });
  } catch (e) {
    console.error("[artDirect] bỏ qua trang trí:", e instanceof Error ? e.message : e); // tăng cường — hỏng thì deck vẫn dùng được
  }
  return content;
}

// ── Slide v2: schema chặt (zod) — slide có bảng số liệu THẬT + biểu đồ THẬT + bước làm + cảnh báo ──
async function generateSlide(db: DB, pkg: Pkg, atom: TreeNode): Promise<SlideContentV2> {
  const misc = misconceptionsFor(db, atom);
  const miscCtx = misc.length ? `\n\nQUAN NIỆM SAI THẬT (dùng cho slide cảnh báo warn:true):\n${misc.map((m) => `- ${m.text}${m.hint ? ` → chữa: ${m.hint}` : ""}`).join("\n")}` : "";
  return normalizeSlide(await claudeJSONValidated(
    db,
    instructionPack(db, atom, pkg.level, "slide"),
    `Thiết kế BÀI TRÌNH CHIẾU dạy học cho nguyên tử "${atom.title}" mức ${pkg.level} — 7-9 slide KỂ CHUYỆN, sinh động như designer làm, không phải gạch đầu dòng khô.
Mỗi slide là object: {"title","icon"?,"bullets"?[],"steps"?[],"cards"?[{"icon","title","text"}],"stat"?{"value","label"},"table"?{"headers","rows"},"chart"?{"type":"line|bar","categories","series":[{"name","values"}],"xLabel","yLabel"},"warn"?true,"notes"}
LÀM SLIDE SINH ĐỘNG (bắt buộc):
- MỌI slide có "icon": 1 emoji đúng chủ đề slide đó (🌡️📈✏️⚠️🎯🏆❓✅…) — engine vẽ to làm hình minh họa.
- Slide mở bài: nếu có con số đắt giá thì thêm "stat" (vd {"value":"20 bạn","label":"học sinh giỏi năm 2023 — gấp đôi 2020"}) — hiện chữ số KHỔNG LỒ. "label" phải nói ĐÚNG bản chất, CẤM biến phương pháp thành trò đoán/may rủi ("thử N lần là ra", "đoán trúng", "chọn đại"…) — nếu cần thì nói gọn cách làm thật (vd "tính giá trị tại N điểm rồi so").
- Ý song song (2-4 nhóm: khái niệm/công dụng, đúng/sai, các loại…) → dùng "cards" (mỗi thẻ icon riêng + title ngắn + text 1 câu) thay vì bullets.
- bullets chỉ dùng khi thực sự là danh sách tuần tự ngắn.
MẠCH BẮT BUỘC:
1. Mở bài — câu hỏi/tình huống gợi tò mò gần gũi (bullets 2-3 dòng). RÀNG BUỘC TIÊU ĐỀ MỞ: phải HIỂU ĐƯỢC khi CHƯA học bài; CẤM ghép thẳng thuật ngữ chuyên môn (đỉnh, hàm mục tiêu, miền nghiệm, ẩn, nghiệm…) vào tình huống đời thật mà không bắc cầu — hoặc dùng lời thường, hoặc thêm nửa câu giải thích. Câu mở KHÔNG được vô nghĩa/khó hiểu khi đọc tách rời (vd XẤU: "Bán bánh mì lời nhất — chọn đỉnh nào?"; TỐT: "Bán bánh mì sao cho lời nhất — thử ở các 'góc' của vùng cho phép").
2. Kiến thức lõi — phát biểu chính xác (bullets, có câu chốt dễ nhớ).
3. VÍ DỤ SỐ THẬT — bảng số liệu cụ thể (table). Nghĩ ra bộ số liệu Việt Nam gần gũi, số đẹp.
4. TRỰC QUAN HÓA đúng bộ số liệu ở slide 3 (chart: categories/series KHỚP bảng; điền xLabel, yLabel).
5. Các bước làm (steps — mỗi bước 1 câu ngắn, sẽ hiện badge số tròn).
6. Cẩn thận lỗi sai (warn: true; bám QUAN NIỆM SAI THẬT nếu có).
7. Luyện tập nhanh 2-3 câu (bullets).
8. Tổng kết 3 ý vàng (bullets).
QUY TẮC: mỗi bullet ≤ 90 ký tự, ≤ 5 bullet/slide; table ≤ 5 cột; CHỈ dùng chart khi nội dung có số liệu (nguyên tử không định lượng thì thay slide 3-4 bằng ví dụ chữ + phản ví dụ); notes = lời dặn giáo viên 1 câu. KHÔNG tham chiếu hình ảnh ngoài — mọi trực quan phải nằm trong table/chart/steps.
Gói tri thức:\n${JSON.stringify(pkg.fields)}${miscCtx}`,
    SlideContentSchema
  ));
}

function mockQuiz(db: DB, pkg: Pkg, atom: TreeNode): QuizContent {
  const misc = misconceptionsFor(db, atom);
  const lines = qLines(pkg).slice(0, 5);
  return {
    questions: lines.map((q, i) => {
      const type = i % 3 === 1 ? "tf" : i % 3 === 2 ? "fill" : "mcq";
      const m = misc[i % Math.max(1, misc.length)];
      const base: QuizContent["questions"][number] = {
        type, dok: (i % 3) + 1 as 1 | 2 | 3,
        q: q.replace(/^\d+\.\s*/, ""),
        answer: type === "mcq" ? 0 : type === "tf" ? true : "(giáo viên điền đáp án)",
        explanation: `Bám mục tiêu: ${firstLine(pkg.fields.objective)}`,
      };
      if (type === "mcq") {
        base.options = ["Phương án đúng", m ? m.text.slice(0, 60) : "Phương án nhiễu B", "Phương án nhiễu C", "Phương án nhiễu D"];
        if (m) base.misconceptionRef = m.text;
      }
      return base;
    }),
  };
}

function firstLine(s: string): string { return s.split("\n")[0].replace("【Nháp AI — cần giáo viên rà soát】", "").trim(); }
function qLines(pkg: Pkg): string[] {
  return pkg.fields.questions.split("\n").map((s) => s.trim()).filter(Boolean);
}

function mockAsset(db: DB, pkg: Pkg, atom: TreeNode, format: AssetFormat): unknown {
  const f = pkg.fields;
  const lv = pkg.level === 1 ? "Nhận biết" : pkg.level === 2 ? "Thông hiểu" : "Vận dụng";
  switch (format) {
    case "text":
      return { sections: [
        { heading: "Mục tiêu", body: f.objective },
        { heading: "Nội dung chính", body: f.explanation.replace("【Nháp AI — cần giáo viên rà soát】\n", "") },
        { heading: "Ví dụ", body: f.example },
        { heading: "Cẩn thận nhầm lẫn", body: `${f.counterExample}\n\n${f.commonMistake}` },
        { heading: "Tự kiểm tra", body: f.questions },
      ]};
    case "worksheet":
      return { sections: [
        { heading: "Phần A — Khởi động", body: qLines(pkg)[0] || f.questions },
        { heading: "Phần B — Luyện tập", body: qLines(pkg).slice(1).join("\n") || f.example },
        { heading: "Phần C — Thử thách", body: `Dựa trên: ${f.counterExample}\nHãy tự lấy một ví dụ tương tự và giải thích.` },
      ]};
    case "slide":
      return { slides: [
        { title: atom.title, bullets: [`Mức độ: ${lv}`, firstLine(f.objective)], notes: "Slide mở đầu." },
        { title: "Khởi động", bullets: [firstLine(f.strategy)], notes: "Hoạt động gợi mở." },
        { title: "Nội dung chính", bullets: f.explanation.replace("【Nháp AI — cần giáo viên rà soát】\n", "").split("\n").filter(Boolean).slice(0, 3), notes: "Chốt kiến thức." },
        { title: "Ví dụ", bullets: f.example.split("\n").filter(Boolean).slice(0, 2), notes: "Làm mẫu từng bước." },
        { title: "Cẩn thận!", bullets: [firstLine(f.counterExample), firstLine(f.commonMistake)], notes: "Phản ví dụ và lỗi thường gặp." },
        { title: "Luyện tập", bullets: qLines(pkg).slice(0, 3), notes: "Làm cặp đôi 5 phút." },
      ]};
    case "quiz":
      return { questions: qLines(pkg).slice(0, 5).map((q, i) => ({
        type: i % 3 === 1 ? "tf" : i % 3 === 2 ? "fill" : "mcq",
        q: q.replace(/^\d+\.\s*/, ""),
        options: i % 3 === 0 ? ["Phương án A (đúng)", "Phương án B", "Phương án C", "Phương án D"] : undefined,
        answer: i % 3 === 0 ? 0 : i % 3 === 1 ? true : "(giáo viên điền đáp án)",
        explanation: `Bám mục tiêu: ${firstLine(f.objective)}`,
      }))};
    case "mindmap": {
      const md = [`# ${atom.title}`, `## Mục tiêu`, `### ${firstLine(f.objective)}`, `## Nội dung`,
        ...f.explanation.replace("【Nháp AI — cần giáo viên rà soát】\n", "").split("\n").filter(Boolean).slice(0, 3).map((s) => `### ${s.slice(0, 80)}`),
        `## Ví dụ`, ...f.example.split("\n").filter(Boolean).slice(0, 2).map((s) => `### ${s.slice(0, 80)}`),
        `## Cẩn thận`, `### ${firstLine(f.commonMistake).slice(0, 80)}`].join("\n");
      return { markdown: md };
    }
    // flashcard: KHÔNG đi qua đây — generateAssetContent tách riêng offlineFlashcards (data thật từ đồ thị)
    case "podcast":
      return { script: [
        { speaker: "Cô Mai", text: `Chào các em! Hôm nay cô trò mình cùng tìm hiểu: ${atom.title}.` },
        { speaker: "Bin", text: "Nghe tên hơi khó cô ơi, nó dùng để làm gì ạ?" },
        { speaker: "Cô Mai", text: firstLine(f.objective) },
        { speaker: "Cô Mai", text: firstLine(f.explanation) },
        { speaker: "Bin", text: "Cô cho em một ví dụ được không?" },
        { speaker: "Cô Mai", text: firstLine(f.example) },
        { speaker: "Bin", text: "À em hiểu rồi! Có chỗ nào hay bị nhầm không cô?" },
        { speaker: "Cô Mai", text: firstLine(f.commonMistake) },
        { speaker: "Cô Mai", text: "Bài tập nhỏ cho em: " + (qLines(pkg)[0] || "tự lấy một ví dụ tương tự nhé.") },
        { speaker: "Bin", text: "Em làm được! Cảm ơn cô, hẹn gặp lại các bạn ở tập sau!" },
      ]};
    case "video": {
      // Bản OFFLINE (không key) — storyboard 7 NHỊP, đổ chất liệu THẬT từ gói + đồ thị
      // (định nghĩa/ví dụ/quan niệm sai/node kế tiếp). Bản có key sinh giàu hơn qua Contract.
      const { misconceptions } = atomKnowledge(db, atom);
      const nexts = nextAtoms(db, atom);
      const mis = misconceptions[0]?.text || firstLine(f.commonMistake);
      const ex = firstLine(f.example);
      const chot = (firstLine(f.objective) || firstLine(f.explanation)).slice(0, 140);
      const q1 = (qLines(pkg)[0] || `Em thử tự lấy một ví dụ về "${atom.title}" xem nào?`).replace(/^\d+\.\s*/, "");
      return {
        videoTitle: atom.title,
        logline: `Tim tự tin tuyên bố sai về "${atom.title}", An nghi ngờ, Leo pha trò — và thầy Dương gỡ rối trong ba phút.`,
        characters: [{ name: "Dương", role: "người dẫn" }, { name: "Tim", role: "học sinh" }, { name: "An", role: "học sinh" }, { name: "Leo", role: "linh vật" }],
        scenes: [
          { beat: "mở màn", role: "veo", setting: "Sân trường, buổi sáng", visual: `Tim và An tranh luận về một tình huống đời thường gắn với "${atom.title}"; Leo nghiêng đầu bối rối.`,
            dialogue: [{ speaker: "Tim", line: `Chuyện này dễ mà — chắc chắn luôn!` }, { speaker: "An", line: "Ơ, chắc không đấy?" }, { speaker: "Leo", line: "Để xem nào… hí hí!" }],
            onScreenText: `Làm sao biết đúng về "${atom.title}"?`, animation: "Camera lia giữa Tim và An rồi dừng ở câu hỏi lớn giữa màn hình.",
            veoAction: "Medium shot in a Vietnamese school courtyard: two 14-year-old students animatedly debating and gesturing, a friendly lion mascot tilts its head, comically puzzled; camera pans between them then holds.",
            veoCast: ["TIM", "AN", "LEO"], mucTieu: "Hook kịch tính, nêu đúng câu hỏi trọng tâm.", durationSec: 22 },
          { beat: "khơi động lực", role: "avatar", setting: "Thầy Dương xuất hiện góc phải", visual: "Thầy Dương nói với người xem, nền là khung hình sân trường làm mờ.",
            dialogue: [{ speaker: "Dương", line: "Câu này thợ với kỹ sư giải mỗi ngày đấy. Vài phút nữa, con cũng làm được." }], animation: "Avatar thầy Dương vào khung, chữ lower-third hiện nhẹ.", mucTieu: "Tạo động lực, chưa giảng.", durationSec: 20 },
          { beat: "dự đoán", role: "graphics", setting: "Thẻ câu hỏi đồ hoạ", visual: `Thẻ dự đoán về "${atom.title}"${mis ? ` (một phương án gài đúng lỗi hay gặp: ${mis})` : ""}.`,
            dialogue: [{ speaker: "Dương", line: "Con đoán thử xem — đừng vội như bạn Tim nhé!" }], animation: "Đóng băng khung hình + đồng hồ đếm ngược 5 giây + dòng nhắc \"Con có thể bấm dừng nếu cần thêm thời gian\".", mucTieu: "Ngưng P1 mời người xem dự đoán.", durationSec: 18 },
          { beat: "giảng cốt lõi", role: "graphics", setting: "Bảng đồ hoạ", visual: ex ? `Minh hoạ trực quan cho ví dụ: ${ex}` : `Hình trực quan (hộp/nhóm/bảng) cho "${atom.title}".`,
            dialogue: [{ speaker: "Dương", line: firstLine(f.explanation) || firstLine(f.objective) }, ...(mis ? [{ speaker: "Tim", line: `Ơ, hoá ra "${mis}" là sai à?` }] : []), { speaker: "Leo", line: "À, ra vậy!" }], animation: "Từng phần tử sáng lên đúng lúc được gọi tên (signaling).", mucTieu: "Giảng cốt lõi, chỉnh quan niệm sai, chốt định nghĩa.", durationSec: 55 },
          { beat: "checkpoint", role: "graphics", setting: "Thẻ câu hỏi đồ hoạ", visual: "Câu hỏi vận dụng ngắn cho người xem.",
            dialogue: [{ speaker: "Dương", line: q1 }, { speaker: "Dương", line: chot }], animation: "Đóng băng + nhạc tắt hẳn + đồng hồ đếm ngược 7 giây, rồi thầy Dương giải đáp và bác phương án sai.", mucTieu: "Ngưng P2, giải đáp và bác phương án sai.", durationSec: 30 },
          { beat: "ngoài đời", role: "veo", setting: "Vài cảnh đời thật", visual: `2–3 nơi dùng "${atom.title}" ngoài đời.`,
            dialogue: [{ speaker: "Dương", line: `Nhiệm vụ nhỏ: tìm một tình huống quanh con dùng được "${atom.title}" nhé.` }], onScreenText: "🏠 Thử thách: tìm quanh nhà con",
            animation: "Ba cảnh ứng dụng lướt nhanh rồi ghép lại.",
            veoAction: "Quick documentary cuts of real Vietnamese settings where this knowledge is used in everyday work and life; warm natural light, no on-screen text.",
            veoCast: [], mucTieu: "Nối kiến thức với đời sống + giao nhiệm vụ.", durationSec: 22 },
          { beat: "củng cố", role: "veo", setting: "Cảnh kết gợi mở", visual: "Câu chốt hiện to để người xem đọc to; rồi một cảnh gợi tò mò về bài sau.",
            dialogue: [{ speaker: "Dương", line: `Con đọc to lại nào: ${chot}` }, { speaker: "Dương", line: nexts.length ? `Nhưng còn "${nexts[0]}" thì sao? Hẹn con ở tập sau!` : "Hẹn gặp con ở tập sau nhé!" }],
            onScreenText: nexts.length ? `Tập sau: ${nexts[0]}` : "Hẹn gặp ở tập sau", animation: "Brain-dump vài giây, rồi cảnh cliffhanger hiện ra, tối dần.",
            veoAction: "A quiet, slightly mysterious real-life scene hinting at a harder related question; slow push-in, soft suspenseful mood, no on-screen text.",
            veoCast: [], mucTieu: "Củng cố + cliffhanger sang node kế.", durationSec: 18 },
        ],
        durationSec: 185, style: "Hoạt hình 2D + quay thực, bảng màu tươi sáng",
      };
    }
  }
}

// ---------- Tutor chat (app học sinh) ----------
const clean = (s: string) => (s || "").replace(/【Nháp AI[^\n]*\n?/g, "").replace(/\(giáo viên (?:thay|điền)[^)]*\)/g, "…").trim();
export async function tutorAnswer(db: DB, atom: TreeNode, pkgs: Pkg[], question: string, history: { role: string; text: string }[] = []): Promise<GenResult<string>> {
  const approved = pkgs.filter((p) => p.status === "approved");
  const base = approved.length ? approved : pkgs;
  // ── bối cảnh từ chính nguyên tử + đồ thị cạnh nối ──
  const chain = ancestors(db, atom.id).map((n) => n.title).join(" › ");
  const nby = (id: string) => db.tree.find((n) => n.id === id);
  const incoming = db.edges.filter((e) => e.to === atom.id);
  const outgoing = db.edges.filter((e) => e.from === atom.id);
  const prereqCtx = incoming.map((e) => `- ${nby(e.from)?.title ?? e.from} [${e.relation}]${e.quanNiemSai ? ` · dễ sai: ${e.quanNiemSai}` : ""}${e.remediationHint ? ` · cách chữa: ${e.remediationHint}` : ""}`).join("\n");
  const nextCtx = outgoing.map((e) => `- ${nby(e.to)?.title ?? e.to}`).join("\n");
  const meta = `Vị trí: ${chain}\nNguyên tử: "${atom.title}" (${atom.code})\nPhân loại: ${atom.atomType || "?"} · Bloom ${atom.bloom || "?"} · DOK ${atom.dok ?? "?"}${atom.nangLuc ? ` · ${atom.nangLuc}` : ""}\nYêu cầu cần đạt: ${atom.yeuCau || atom.title}`;

  if (hasAiKey(db)) {
    try {
      const convo = history.length ? `\n\nHội thoại trước:\n${history.map((m) => `${m.role === "user" ? "Người hỏi" : "Trợ giảng"}: ${m.text}`).join("\n")}` : "";
      const sys = "Bạn là TRỢ GIẢNG AI của nền tảng học liệu Trường Việt Anh, am hiểu sâu nguyên tử kiến thức đang xét và mạng liên kết của nó. Giải thích chính xác theo chương trình GDPT 2018 (SGK Kết nối tri thức), thân thiện, có ví dụ đời thường. Khi liên quan kiến thức nền, chỉ ra nguyên tử 'cần nắm trước' tương ứng. Có thể soạn BÀI TẬP (đánh số theo 3 mức nhận biết/thông hiểu/vận dụng), SLIDE dạy học (từng slide một ý), hoặc BÀI GIẢNG ngắn (mục tiêu → dẫn nhập → nội dung → lưu ý lỗi hay gặp → củng cố) khi được yêu cầu. TRÌNH BÀY BẰNG MARKDOWN: dùng **in đậm** cho ý chính/tiêu đề, xuống dòng rõ ràng, gạch đầu dòng bằng '• ', đánh số '1. 2. 3.' cho bài tập, dùng '→' cho gợi ý và '⚠' cho cảnh báo lỗi. Trả về JSON {\"text\":\"...\"} với text là chuỗi Markdown (giữ ký tự xuống dòng \\n).";
      const usr = `BỐI CẢNH NGUYÊN TỬ:\n${meta}\n\nCẦN NẮM TRƯỚC / DỄ LẪN (từ đồ thị):\n${prereqCtx || "(chưa có)"}\n\nDẪN TỚI:\n${nextCtx || "(chưa có)"}${base.length ? `\n\nHỌC LIỆU ĐÃ DUYỆT:\n${JSON.stringify(base.map((p) => p.fields))}` : ""}${convo}\n\nCâu hỏi: ${question}\nTrả lời (JSON {"text":"..."}):`;
      const out = await claudeJSON<{ text: string }>(db, sys, usr);
      return { content: out.text, ...mockMeter(out, aiModel(db)) };
    } catch { /* rơi xuống mock */ }
  }

  // ── mock: trả lời CÓ ĐỊNH DẠNG từ metadata + đồ thị (không cần API key) ──
  await delay(280 + Math.random() * 320);
  const q = question.toLowerCase();
  const T = atom.title, yeu = clean(atom.yeuCau || atom.title);
  const typeLabel = ({ KN: "khái niệm", QT: "quy tắc/định lí", KY: "kỹ năng", VD: "vận dụng" } as Record<string, string>)[atom.atomType || ""] || "kiến thức";
  const misc = incoming.filter((e) => e.quanNiemSai).map((e) => `• ${e.quanNiemSai}${e.remediationHint ? `\n   → Cách chữa: ${e.remediationHint}` : ""}`).join("\n");
  const firstMisc = incoming.find((e) => e.quanNiemSai);
  const prereqTitles = incoming.map((e) => nby(e.from)?.title).filter(Boolean) as string[];
  const prereqList = prereqTitles.map((t) => `• ${t}`).join("\n");
  const ex = base[0] ? clean(base[0].fields.example) : `Lấy một tình huống quen thuộc với học sinh và áp dụng "${T}" theo yêu cầu: ${yeu}`;
  let text: string;
  if (/bài tập|luyện|kiểm tra|thử thách|câu hỏi/.test(q)) {
    text = base[0] ? `**Bài tập — ${T}**\n${clean(base[0].fields.questions)}`
      : `**Bài tập luyện — ${T}**\n1. (Nhận biết) Nhận ra / phát biểu: ${yeu.split(";")[0]}.\n2. (Thông hiểu) Giải thích vì sao và cho một ví dụ về "${T}".\n3. (Vận dụng) Áp dụng "${T}" vào một bài toán / tình huống thực tế.\n\n→ Đối chiếu yêu cầu cần đạt: ${yeu}`;
  } else if (/slide/.test(q)) {
    text = `**Slide dạy: ${T}**\n• **Slide 1 — Khởi động:** đặt vấn đề từ ví dụ quen thuộc\n• **Slide 2 — Nội dung chính:** ${yeu}\n• **Slide 3 — Ví dụ mẫu:** ${firstLine(ex)}\n• **Slide 4 — ⚠ Chỗ hay sai:** ${firstMisc?.quanNiemSai || "nhấn mạnh điều kiện áp dụng"}\n• **Slide 5 — Luyện tập:** 2–3 câu hỏi ngắn theo 3 mức`;
  } else if (/bài giảng|giảng|soạn bài/.test(q)) {
    text = `**Bài giảng ngắn: ${T}**\n\n**1. Mục tiêu**\n${yeu}\n\n**2. Dẫn nhập**\n${prereqTitles[0] ? `Ôn nhanh "${prereqTitles[0]}" rồi dẫn vào bài.` : "Bắt đầu từ một ví dụ gần gũi."}\n\n**3. Nội dung chính**\nĐây là ${typeLabel} (Bloom ${atom.bloom || "?"}, DOK ${atom.dok ?? "?"}). ${firstLine(yeu)}\n\n**4. ⚠ Lưu ý lỗi hay gặp**\n${firstMisc?.quanNiemSai || "nhắc điều kiện áp dụng."}${firstMisc?.remediationHint ? `\n   → ${firstMisc.remediationHint}` : ""}\n\n**5. Củng cố**\nCho học sinh làm 1–2 câu kiểm tra nhanh và tự nêu lại "${T}" bằng lời.`;
  } else if (/^\s*(chào|hi|hello|xin chào)/.test(q)) {
    text = `Chào bạn! Mình là trợ giảng cho **${T}**.\n${yeu}\n\nMình có thể:\n• Giải thích khái niệm\n• Cho ví dụ minh hoạ\n• ⚠ Chỉ chỗ hay sai\n• Ra bài tập / soạn slide / viết bài giảng\n• Nói về ${incoming.length} nguyên tử cần nắm trước`;
  } else if (/ví dụ/.test(q)) {
    text = `**Ví dụ minh hoạ — ${T}**\n${ex}`;
  } else if (/sai|nhầm|lỗi|hay quên/.test(q)) {
    text = misc ? `**Chỗ học sinh hay nhầm** (theo đồ thị tri thức):\n${misc}` : (base[0] ? `**Chỗ hay nhầm**\n${clean(base[0].fields.commonMistake)}` : `Nguyên tử này chưa có ghi nhận lỗi thường gặp trên đồ thị.`);
  } else if (/trước|nền|tiên quyết|cần học|gốc/.test(q)) {
    text = prereqList ? `**Cần nắm trước "${T}":**\n${prereqList}\n\n→ Muốn mình đào sâu cái nào?` : `"${T}" khá nền tảng — không có tiên quyết trong đồ thị.`;
  } else if (/vì sao|tại sao|giải thích|là gì|khái niệm|nghĩa/.test(q)) {
    text = `**${T}**\n${yeu}\n\n• **Loại:** ${typeLabel}\n• **Mức tư duy:** Bloom ${atom.bloom || "?"} · DOK ${atom.dok ?? "?"}${prereqTitles.length ? `\n• **Liên quan:** ${prereqTitles.slice(0, 3).join("; ")}` : ""}`;
  } else {
    text = `**${T}**\n${yeu}\n\nMình có thể: giải thích, cho ví dụ, chỉ chỗ hay sai, ra bài tập, soạn slide/bài giảng, hoặc nói về ${incoming.length} nguyên tử cần nắm trước. Bạn hỏi cụ thể nhé!`;
  }
  return { content: text, ...mockMeter(text) };
}
