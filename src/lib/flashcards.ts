import { DB, TreeNode, remediationFor } from "./store";

// Thẻ ghi nhớ sinh THẲNG từ atom + đồ thị (không qua AI, không cần Gói tri thức):
// thẻ "cốt lõi" từ yêu cầu cần đạt, thẻ "bẫy" từ quan_niem_sai của các cạnh trỏ vào atom.
export interface FlashCard { idx: number; front: string; back: string; kind: "core" | "trap" }

export function flashcardsForAtom(db: DB, atom: TreeNode): FlashCard[] {
  const cards: FlashCard[] = [];
  const yeu = (atom.yeuCau || atom.title).replace("【Nháp AI — cần giáo viên rà soát】\n", "").trim();
  cards.push({ idx: cards.length, front: `${atom.title} — yêu cầu cần đạt là gì?`, back: yeu, kind: "core" });

  const approved = db.packages.find((p) => p.atomId === atom.id && p.status === "approved");
  if (approved) {
    cards.push({ idx: cards.length, front: "Cho một ví dụ minh hoạ", back: approved.fields.example.split("\n")[0] || approved.fields.example, kind: "core" });
  }

  for (const e of remediationFor(db, atom.id)) {
    if (!e.quanNiemSai) continue;
    cards.push({
      idx: cards.length,
      front: `⚠ Nhận diện lỗi: "${e.quanNiemSai}" — đúng hay sai?`,
      back: e.remediationHint || "Sai — hãy xem lại yêu cầu cần đạt của nguyên tử để tránh nhầm lẫn này.",
      kind: "trap",
    });
  }
  return cards;
}
