"use client";
import React, { useEffect, useState } from "react";
import { TreePine, PenLine, Wand2, CheckCircle2, GraduationCap, X } from "lucide-react";
import { User } from "@/lib/shared";
import { Button, cls } from "./ui";

const STEPS = [
  { icon: TreePine, title: "1 · Cây kiến thức", body: "Mỗi môn được phân rã thành cây: lớp → chương → bài → điểm kiến thức → nguyên tử. Bấm vào một nhánh để phóng vào, bấm nguyên tử (lá) để mở." },
  { icon: PenLine, title: "2 · Gói tri thức", body: "Với mỗi nguyên tử × 3 mức độ, bạn biên soạn một “gói tri thức” (mục tiêu, giải thích, ví dụ, lỗi hay gặp…). AI nháp trước, bạn sửa và duyệt." },
  { icon: Wand2, title: "3 · Sinh học liệu", body: "Từ gói đã duyệt, tạo mọi định dạng: bài đọc, slide, quiz, mindmap, podcast, video hoạt hình… mỗi định dạng do một agent AI chuyên trách." },
  { icon: CheckCircle2, title: "4 · Duyệt & kho dùng chung", body: "Tổ trưởng duyệt gói lên “Chuẩn trường”. Học liệu vào kho dùng chung để cả trường tái sử dụng." },
  { icon: GraduationCap, title: "5 · Cho học sinh", body: "Xem trước như học sinh trong app gia sư. Học liệu Chuẩn trường chính là nội dung cho app Việt Anh Personal Tutor." },
];

export default function Onboarding({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => { try { if (!localStorage.getItem("va_onboard_v1")) setOpen(true); } catch { /* ignore */ } }, []);
  const close = () => { try { localStorage.setItem("va_onboard_v1", "1"); } catch { /* ignore */ } setOpen(false); };
  if (!open) return null;
  const s = STEPS[i]; const Icon = s.icon; const last = i === STEPS.length - 1;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/40 p-4 fade-in" style={{ zIndex: 55 }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-xl fade-up">
        <div className="relative bg-brand px-6 py-5 text-on-brand">
          <button onClick={close} aria-label="Bỏ qua" className="absolute right-3 top-3 rounded-lg p-1 text-on-brand/80 hover:bg-on-brand/15"><X size={18} /></button>
          <p className="text-xs text-on-brand/75">Chào {user.name} — 30 giây làm quen</p>
          <h3 className="mt-0.5 text-lg font-bold">Học liệu Việt Anh hoạt động thế nào?</h3>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-bg text-brand"><Icon size={24} strokeWidth={1.75} /></span>
            <div>
              <p className="font-semibold text-ink">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, k) => <span key={k} className={cls("h-1.5 rounded-full transition-all", k === i ? "w-5 bg-brand" : "w-1.5 bg-line-strong")} />)}
            </div>
            <div className="flex gap-2">
              {!last && <Button variant="ghost" onClick={close}>Bỏ qua</Button>}
              <Button onClick={() => (last ? close() : setI(i + 1))}>{last ? "Bắt đầu dùng" : "Tiếp"}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
