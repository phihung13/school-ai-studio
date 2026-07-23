"use client";
import React, { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit } from "lucide-react";
import { getData, api, Button, Spinner, cls } from "./ui";

interface DueCard { idx: number; front: string; back: string; kind: "core" | "trap"; due: string }
interface FlashData { atomId: string; cards: DueCard[]; dueCount: number; now: string }

const GRADE_BTN: { grade: 1 | 2 | 3 | 4; label: string; cls: string }[] = [
  { grade: 1, label: "Quên", cls: "border-danger-line bg-danger-bg text-danger hover:brightness-95" },
  { grade: 2, label: "Khó", cls: "border-warn-line bg-warn-bg text-warn hover:brightness-95" },
  { grade: 3, label: "Nhớ", cls: "border-ok-line bg-ok-bg text-ok hover:brightness-95" },
  { grade: 4, label: "Dễ", cls: "border-brand-line bg-brand-bg text-brand-ink hover:brightness-95" },
];

// Ôn thẻ ghi nhớ theo lịch FSRS: thẻ sinh thẳng từ atom + đồ thị (kể cả thẻ "bẫy" từ quan_niem_sai), không cần AI.
export default function FlashcardReview({ atomId }: { atomId: string }) {
  const [data, setData] = useState<FlashData | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => { setData(null); getData<FlashData>("flashcards", { id: atomId }).then(setData).catch(() => {}); };
  useEffect(load, [atomId]);

  if (!data) return <div className="flex justify-center py-6"><Spinner label="Đang tải thẻ…" /></div>;
  const due = data.cards.filter((c) => c.due <= data.now);
  const card = due[0];

  if (!card) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <BrainCircuit size={28} className="text-ok" strokeWidth={1.5} />
        <p className="text-sm font-medium text-ink">Hết thẻ đến hạn ôn — quay lại sau nhé!</p>
        <p className="text-xs text-muted">{data.cards.length} thẻ tổng cộng cho nguyên tử này.</p>
      </div>
    );
  }

  const grade = async (g: 1 | 2 | 3 | 4) => {
    setBusy(true);
    try { await api("flashGrade", { atomId, idx: card.idx, grade: g }); setFlipped(false); load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <div className={cls("flip-card h-56 w-full max-w-lg cursor-pointer", flipped && "flipped")} onClick={() => setFlipped((f) => !f)}>
        <div className="flip-inner h-full w-full">
          <div className={cls("flip-face flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center shadow-sm",
            card.kind === "trap" ? "border-warn-line bg-warn-bg/40" : "border-brand-line bg-surface")}>
            {card.kind === "trap" && <span className="flex items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle size={13} />Nhận diện lỗi</span>}
            <p className="font-display text-lg font-semibold text-ink">{card.front}</p>
          </div>
          <div className="flip-face flip-back flex items-center justify-center rounded-xl bg-brand p-6 text-center shadow-sm">
            <p className="text-base font-medium text-on-brand">{card.back}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Bấm vào thẻ để lật · còn {due.length} thẻ đến hạn</p>
      {flipped ? (
        <div className="mt-3 grid w-full max-w-lg grid-cols-4 gap-2">
          {GRADE_BTN.map((b) => (
            <button key={b.grade} disabled={busy} onClick={() => grade(b.grade)}
              className={cls("rounded-md border px-2 py-2 text-sm font-semibold transition disabled:opacity-50", b.cls)}>
              {b.label}
            </button>
          ))}
        </div>
      ) : (
        <Button className="mt-3" variant="secondary" onClick={() => setFlipped(true)}>Lật thẻ để đánh giá</Button>
      )}
    </div>
  );
}
