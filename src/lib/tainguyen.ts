// Tài nguyên NotebookLM — Claude ĐẨY LÊN qua webhook (POST /api/tainguyen) sau mỗi lần sinh.
// File lớn (Video/Audio-tranh-luan/Podcast/Slide/Infographic) ở NGUYÊN trên Google Drive — Studio
// chỉ giữ driveFileId + nhúng khung xem sẵn của Drive. HTML tương tác nhỏ (Mindmap/Quiz/Flashcards)
// và Text (markdown) lưu thẳng nội dung trong DB vì Drive không thực thi JS khi nhúng.
import { DB, TnAsset, TN_INLINE_FORMATS } from "./store";

export const TN_FORMATS = ["Text", "Infographic", "Mindmap", "Video", "Audio-tranh-luan", "Podcast", "Slide", "Quiz", "Flashcards"] as const;
export const TN_LABEL: Record<string, string> = {
  Text: "Bài đọc", Infographic: "Infographic", Mindmap: "Sơ đồ tư duy", Video: "Video",
  "Audio-tranh-luan": "Audio tranh luận", Podcast: "Podcast", Slide: "Slide", Quiz: "Quiz", Flashcards: "Flashcards",
};

export function isInline(format: string): boolean { return TN_INLINE_FORMATS.includes(format); }

// URL nhúng/tải của Google Drive — dùng cho 5 định dạng nặng (driveFileId).
export function driveEmbedUrl(fileId: string): string { return `https://drive.google.com/file/d/${fileId}/preview`; }
export function driveOpenUrl(fileId: string): string { return `https://drive.google.com/file/d/${fileId}/view`; }
export function driveDownloadUrl(fileId: string): string { return `https://drive.google.com/uc?export=download&id=${fileId}`; }

export function listByAtom(db: DB, atomId: string): TnAsset[] {
  return db.tainguyen.filter((t) => t.atomId === atomId)
    .sort((a, b) => TN_FORMATS.indexOf(a.format as never) - TN_FORMATS.indexOf(b.format as never) || (a.dok ?? 0) - (b.dok ?? 0));
}

// Bản đồ phủ: atomId → tập định dạng đã có (cho duyệt cây/thống kê).
export function coverageMap(db: DB): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const t of db.tainguyen) { (map[t.atomId] ||= new Set()).add(String(t.format)); }
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(map)) out[k] = [...map[k]].sort();
  return out;
}
