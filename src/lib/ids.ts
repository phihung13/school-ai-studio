// Sinh ID chuẩn đồng nhất (sau di trú KC/Q/E/R/L). Studio là BÊN SINH ID (authority).
//  • KC- + 7 số NGẪU NHIÊN không trùng — cho điểm tri thức (atom/node). Mã đại diện, vô nghĩa vị trí.
//  • Q-/E-/R-/L- + 7 số TUẦN TỰ (++counter trong settings.idSeq) — câu hỏi / cạnh / học liệu / thang Socratic.
//  • Mã vị trí cũ (TA10-C04-E01) vẫn sống ở field `code` của atom (display + suy chương/cụm khi import).
import type { DB } from "./store";

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

function seq(db: DB): { q: number; e: number; r: number; l?: number } {
  if (!db.settings.idSeq) db.settings.idSeq = { q: 0, e: 0, r: 0 };
  return db.settings.idSeq;
}

// Cấp id TUẦN TỰ AN TOÀN. Vì sao không chỉ ++counter: bộ đếm nằm trong settings, mà settings có thể
// TỤT LẠI (VPS boot lại bằng pull-db từ Supabase; máy dev mirror settings cũ của mình đè lên; khôi phục
// bản chụp). Đếm tụt → cấp lại id ĐÃ DÙNG → hai bản ghi trùng id: app trả nhầm bản ghi (bấm tải flashcard
// ra kịch bản video của người khác) và mọi lượt đẩy lên Supabase VỠ TOÀN LÔ (ON CONFLICT gặp 2 dòng cùng
// khoá → 21000) nên dữ liệu mới im lặng không được lưu bền.
// Cách chữa: trước khi cấp, nâng bộ đếm lên trên MỌI id đang tồn tại trong đúng bộ sưu tập đó.
// Quét MỘT LẦN cho mỗi lần nạp DB rồi nhớ mốc cao nhất (WeakMap theo đúng object DB — nạp lại DB là
// object mới nên mốc tự hết hạn), để nhập kho hàng nghìn dòng không thành O(n²).
const hiMark = new WeakMap<DB, Record<string, number>>();
function mint(db: DB, prefix: string, cur: number, existing: { id?: string }[], set: (n: number) => void): string {
  let marks = hiMark.get(db);
  if (!marks) { marks = {}; hiMark.set(db, marks); }
  let hi = marks[prefix];
  if (hi === undefined) {
    hi = cur;
    const re = new RegExp(`^${prefix}(\\d{7})$`);
    for (const x of existing) {
      const m = x.id?.match(re);
      if (m) { const n = Number(m[1]); if (n > hi) hi = n; }
    }
  } else if (cur > hi) hi = cur;
  const next = hi + 1;
  marks[prefix] = next;
  set(next);
  return prefix + pad7(next);
}

export function newQ(db: DB): string { const s = seq(db); return mint(db, "Q-", s.q, db.questions, (n) => { s.q = n; }); }
export function newE(db: DB): string { const s = seq(db); return mint(db, "E-", s.e, db.edges, (n) => { s.e = n; }); }
export function newR(db: DB): string { const s = seq(db); return mint(db, "R-", s.r, db.assets, (n) => { s.r = n; }); }
export function newL(db: DB): string { const s = seq(db); return mint(db, "L-", s.l ?? 0, db.ladders, (n) => { s.l = n; }); }

export const isKC = (s: string) => /^KC-\d{7}$/.test(s);
export const isQ = (s: string) => /^Q-\d{7}$/.test(s);
export const isE = (s: string) => /^E-\d{7}$/.test(s);
export const isR = (s: string) => /^R-\d{7}$/.test(s);
export const isL = (s: string) => /^L-\d{7}$/.test(s);
