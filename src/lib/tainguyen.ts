// Chỉ mục tài nguyên NotebookLM. Nguồn = TAINGUYEN_DIR (đĩa cũ D:\TaiNguyen HOẶC thư mục
// Google Drive đã đồng bộ qua Drive for Desktop — cả hai đọc chung một bộ quét).
// Khoá nối = KC (atom.id sau đồng nhất ID), xuất hiện dưới 2 quy ước tên thư mục:
//   • Đĩa cũ : ...\<KC-xxxxxxx>\DOK<n>\<Format>_<tên>.<ext>            (thư mục = ĐÚNG mã KC)
//   • Drive  : ...\<NN_Tên-bài-đọc-được_KC-xxxxxxx>\dok<n>\<Format>_<tên>_DOK<n>.<ext>
//              (mã KC là HẬU TỐ của tên thư mục; DOK có thể nằm ở CUỐI tên tệp, không phải đầu)
// → tìm đoạn KC-\d{7} BẤT KỲ ĐÂU trong tên thư mục; đọc DOK ưu tiên từ TÊN TỆP (khớp đúng
// từng tệp hơn là suy từ thư mục cha, và không phụ thuộc DOK nằm ở đầu hay cuối tên).
import fs from "fs";
import path from "path";

export const TAINGUYEN_DIR = process.env.TAINGUYEN_DIR
  ? path.resolve(process.env.TAINGUYEN_DIR)
  : "D:\\TaiNguyen";

// 9 định dạng NotebookLM (khớp tên tệp: token trước dấu "_" đầu tiên).
export type TnFormat =
  | "Text" | "Infographic" | "Mindmap" | "Video" | "Audio-tranh-luan"
  | "Podcast" | "Slide" | "Quiz" | "Flashcards";

// Thứ tự trình bày chuẩn + nhãn tiếng Việt (dùng chung server/client).
export const TN_FORMATS: TnFormat[] = ["Text", "Infographic", "Mindmap", "Video", "Audio-tranh-luan", "Podcast", "Slide", "Quiz", "Flashcards"];
export const TN_LABEL: Record<string, string> = {
  Text: "Bài đọc", Infographic: "Infographic", Mindmap: "Sơ đồ tư duy", Video: "Video",
  "Audio-tranh-luan": "Audio tranh luận", Podcast: "Podcast", Slide: "Slide", Quiz: "Quiz", Flashcards: "Flashcards",
};

// Cách nhúng suy từ đuôi tệp.
export type TnViewer = "iframe" | "pdf" | "video" | "audio" | "image" | "markdown" | "download";

export interface TnResource {
  kc: string;              // KC-xxxxxxx (hoặc "_ca-bai" cho mức bài)
  dok: number | null;      // 1..3 hoặc null
  format: TnFormat | string;
  name: string;            // phần tên sau format (đã bỏ DOKn)
  file: string;            // TÊN TỆP THẬT trên đĩa (hiện y như khi mở thư mục)
  ext: string;             // đuôi không dấu chấm, thường
  viewer: TnViewer;
  rel: string;             // đường dẫn tương đối trong TAINGUYEN_DIR (khoá serve)
  folder: string;          // đường dẫn thư mục trên đĩa tới trước đoạn KC (Môn / Lớp / Chương / Bài)
  size: number;
  mtime: number;
}

const VIEWER_BY_EXT: Record<string, TnViewer> = {
  html: "iframe", htm: "iframe", pdf: "pdf",
  mp4: "video", webm: "video", mov: "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  md: "markdown", txt: "markdown",
};

export function viewerForExt(ext: string): TnViewer {
  return VIEWER_BY_EXT[ext.toLowerCase()] || "download";
}

// Audio-tranh-luan lưu .mp4 nhưng bản chất là AUDIO → cho player audio; giữ video cho Video.
function refineViewer(format: string, ext: string): TnViewer {
  const v = viewerForExt(ext);
  if (format === "Audio-tranh-luan" || format === "Podcast") return v === "video" ? "audio" : v;
  return v;
}

let cache: { at: number; list: TnResource[] } | null = null;
const TTL = 15_000;

function walk(dir: string, root: string, out: TnResource[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full, root, out); continue; }
    if (e.name.startsWith(".")) continue;
    const rel = path.relative(root, full);
    const parts = rel.split(path.sep);
    // tìm đoạn CHỨA mã KC-xxxxxxx (đĩa cũ: toàn bộ tên = KC; Drive: KC là hậu tố tên thư mục) hoặc _ca-bai
    const kcIdx = parts.findIndex((p) => /KC-\d{7}/.test(p) || p === "_ca-bai");
    if (kcIdx === -1) continue;
    const kcSeg = parts[kcIdx];
    const kcM = kcSeg.match(/KC-\d{7}/);
    const kc = kcM ? kcM[0] : kcSeg;                        // "_ca-bai" giữ nguyên nếu không có mã
    const dokFolder = parts.slice(kcIdx + 1).find((p) => /^DOK\d$/i.test(p));
    const dokFromFolder = dokFolder ? Number(dokFolder.slice(3)) : null;
    const file = e.name;
    const dot = file.lastIndexOf(".");
    const ext = dot >= 0 ? file.slice(dot + 1).toLowerCase() : "";
    const base = dot >= 0 ? file.slice(0, dot) : file;
    const usc = base.indexOf("_");
    const format = usc >= 0 ? base.slice(0, usc) : base;
    const rest = usc >= 0 ? base.slice(usc + 1) : "";
    const dokInName = rest.match(/DOK(\d)/i);
    const dok = dokInName ? Number(dokInName[1]) : dokFromFolder;  // ưu tiên DOK đọc từ TÊN TỆP
    const name = rest.replace(/[_-]?DOK\d[_-]?/i, "_").replace(/^_+|_+$/g, "").replace(/[-_]+/g, " ").trim();
    let st: fs.Stats; try { st = fs.statSync(full); } catch { continue; }
    const folder = parts.slice(0, kcIdx).join(" / ");   // Môn / Lớp / Chương / Bài (theo đĩa)
    out.push({ kc, dok, format, name, file, ext, viewer: refineViewer(format, ext), rel, folder, size: st.size, mtime: st.mtimeMs });
  }
}

export function scanAll(force = false): TnResource[] {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.list;
  const list: TnResource[] = [];
  if (fs.existsSync(TAINGUYEN_DIR)) walk(TAINGUYEN_DIR, TAINGUYEN_DIR, list);
  cache = { at: Date.now(), list };
  return list;
}

export function resourcesForKC(kc: string): TnResource[] {
  return scanAll().filter((r) => r.kc === kc)
    .sort((a, b) => String(a.format).localeCompare(String(b.format)) || (a.dok ?? 0) - (b.dok ?? 0));
}

// Bản đồ phủ: KC → tập định dạng đã có (cho tổng quan/thống kê).
export function coverage(): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const r of scanAll()) { (map[r.kc] ||= new Set()).add(String(r.format)); }
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(map)) out[k] = [...map[k]].sort();
  return out;
}

// Chuyển rel (an toàn) → đường dẫn tuyệt đối trong TAINGUYEN_DIR. null nếu thoát ra ngoài.
export function safeResolve(rel: string): string | null {
  const abs = path.resolve(TAINGUYEN_DIR, rel);
  const rootWithSep = TAINGUYEN_DIR.endsWith(path.sep) ? TAINGUYEN_DIR : TAINGUYEN_DIR + path.sep;
  if (abs !== TAINGUYEN_DIR && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

export const CONTENT_TYPE: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  md: "text/markdown; charset=utf-8", txt: "text/plain; charset=utf-8",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",  // Slide trên Drive là .pptx gốc (đĩa cũ dùng .pdf)
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
