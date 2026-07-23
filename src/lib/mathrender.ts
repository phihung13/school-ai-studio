// Render công thức bằng KaTeX THẬT (thay bộ readableMath cũ — chỉ thay LaTeX→Unicode gần đúng,
// làm mất gạch phân số / mũ lồng / vector-mũ → GV Toán phản ánh "công thức không đúng định dạng").
//
// Dùng chung cho: component <M> trên web (ui.tsx) và bản xuất HTML tự chứa (export route).
// KaTeX là thư viện đồng hình (chạy cả server lẫn client) nên import thẳng được.
import katex from "katex";

// ── Chuẩn hóa 1 công thức trước khi đưa vào KaTeX ──
// GHI NHỚ CASE (đồng bộ với memory [[math-katex-render]]):
//  • "____" (≥2 gạch dưới) = CHỖ TRỐNG điền khuyết trong câu hỏi (vd \overrightarrow{____}) — KaTeX
//    coi "_" là chỉ số nên từ chối; đổi thành ô kẻ chân. KHÔNG đụng subscript 1 gạch (x_1, S_{đáy}).
export function normalizeTex(tex: string): string {
  let t = tex;
  t = t.replace(/_{2,}/g, "\\underline{\\hphantom{00}}"); // chỗ trống điền
  return t;
}

// Bắt các đoạn toán: \[ … \] (khối) · \( … \) (dòng) · $ … $ (dòng).
const DELIM = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+?\$)/g;

export type MathSeg = { math: boolean; display: boolean; value: string };

// Cắt chuỗi hỗn hợp (chữ + công thức) thành từng đoạn để render riêng.
export function splitMath(raw: string): MathSeg[] {
  const segs: MathSeg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  DELIM.lastIndex = 0;
  while ((m = DELIM.exec(raw))) {
    if (m.index > last) segs.push({ math: false, display: false, value: raw.slice(last, m.index) });
    const tok = m[0];
    let inner: string;
    let display = false;
    if (tok.startsWith("\\[")) { inner = tok.slice(2, -2); display = true; }
    else if (tok.startsWith("\\(")) { inner = tok.slice(2, -2); }
    else { inner = tok.slice(1, -1); } // $ … $
    segs.push({ math: true, display, value: inner.trim() });
    last = m.index + tok.length;
  }
  if (last < raw.length) segs.push({ math: false, display: false, value: raw.slice(last) });
  return segs;
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

// Render 1 công thức → HTML. throwOnError:false → công thức hỏng hiện ĐỎ kèm nguồn thay vì làm sập trang.
export function katexHtml(tex: string, display = false): string {
  try {
    return katex.renderToString(normalizeTex(tex), {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "htmlAndMathml",
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

// Có chứa đoạn toán delimited không? (để export biết có cần nhúng CSS KaTeX không)
export function hasMath(raw?: string | null): boolean {
  if (!raw) return false;
  DELIM.lastIndex = 0;
  return DELIM.test(raw);
}
