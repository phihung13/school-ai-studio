import { cls } from "@/components/ui";

// ── Dấu hiệu nhận diện của app: chiếc lá ─────────────────────────────────────────
// ĐÂY LÀ BẢN GỐC DUY NHẤT. Bộ icon (favicon, icon iOS, ảnh chia sẻ link) dựng từ CÙNG path này
// trong scripts/gen-icons.mjs — sửa hình ở đây thì chạy lại `node scripts/gen-icons.mjs`, nếu không
// logo trên giao diện và logo ở tab trình duyệt sẽ lệch nhau.
export function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path d="M20 4C11 4 4 10 4 19c0 0 0 1 1 1 9 0 15-6 15-15 0 0 0-1-0-1Z" fill="currentColor" opacity="0.92" />
      <path d="M6 18C10 13 14 10 18 8" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const BADGE = {
  sm: { box: "h-7 w-7 rounded-lg", leaf: "h-4 w-4" },
  md: { box: "h-10 w-10 rounded-2xl", leaf: "h-6 w-6" },
  lg: { box: "h-12 w-12 rounded-2xl", leaf: "h-7 w-7" },
};

// Lá trắng trên nền brand bo góc — đúng khối màu của favicon để người dùng nhận ra app ở mọi chỗ.
export function LogoBadge({ size = "md", className }: { size?: keyof typeof BADGE; className?: string }) {
  const s = BADGE[size];
  return (
    <span className={cls("flex shrink-0 items-center justify-center bg-gradient-to-b from-brand to-brand-deep text-on-brand", s.box, className)}>
      <LeafMark className={s.leaf} />
    </span>
  );
}
