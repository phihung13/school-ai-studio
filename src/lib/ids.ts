// Sinh ID chuẩn đồng nhất (sau di trú KC/Q/E/R/L). Studio là BÊN SINH ID (authority).
//  • KC- + 7 số NGẪU NHIÊN không trùng — cho điểm tri thức (atom/node). Mã đại diện, vô nghĩa vị trí.
//  • Q-/E-/R- + 7 số TUẦN TỰ (++counter trong settings.idSeq) — câu hỏi / cạnh / học liệu.
//  • Mã vị trí cũ (TA10-C04-E01) vẫn sống ở field `code` của atom (display + suy chương/cụm khi import).
import { DB } from "./store";

const pad7 = (n: number) => String(n).padStart(7, "0");

// KC ngẫu nhiên, không trùng bất kỳ id nào đang có trong cây (mọi atom đã là KC sau di trú).
// Nhận `used` tuỳ chọn để sinh hàng loạt (import) không phải quét lại cây mỗi lần.
export function newKC(db: DB, used?: Set<string>): string {
  const set = used ?? new Set(db.tree.map((n) => n.id));
  let k: string;
  do { k = "KC-" + pad7(Math.floor(Math.random() * 1e7)); } while (set.has(k));
  set.add(k);
  return k;
}

function seq(db: DB): { q: number; e: number; r: number } {
  if (!db.settings.idSeq) db.settings.idSeq = { q: 0, e: 0, r: 0 };
  return db.settings.idSeq;
}
export function newQ(db: DB): string { return "Q-" + pad7(++seq(db).q); }
export function newE(db: DB): string { return "E-" + pad7(++seq(db).e); }
export function newR(db: DB): string { return "R-" + pad7(++seq(db).r); }

export const isKC = (s: string) => /^KC-\d{7}$/.test(s);
export const isQ = (s: string) => /^Q-\d{7}$/.test(s);
export const isE = (s: string) => /^E-\d{7}$/.test(s);
export const isR = (s: string) => /^R-\d{7}$/.test(s);
