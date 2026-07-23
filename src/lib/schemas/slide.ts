import { z } from "zod";

// Schema slide v2 — slide KHÔNG chỉ là chữ: có bảng số liệu thật, biểu đồ thật (render native
// trong PowerPoint lẫn SVG trên web), các bước đánh số, slide cảnh báo. Web và PPTX cùng đọc
// MỘT JSON này → hai bản khớp nhau theo thiết kế.
// z.coerce: model hay trả số dạng chuỗi ("10") hoặc mốc năm dạng số (2020) — ép kiểu thay vì đốt lượt retry
export const SlideChartSchema = z.object({
  type: z.enum(["line", "bar"]),
  categories: z.array(z.coerce.string()).min(2).max(12),
  series: z.array(z.object({ name: z.coerce.string(), values: z.array(z.coerce.number()) })).min(1).max(3),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const SlideTableSchema = z.object({
  headers: z.array(z.coerce.string()).min(1).max(6),
  rows: z.array(z.array(z.coerce.string())).min(1).max(8),
});

// Thẻ màu (nhóm ý song song thay bullet khô) + con số ấn tượng (mở bài)
export const SlideCardSchema = z.object({ icon: z.coerce.string().optional(), title: z.coerce.string(), text: z.coerce.string().optional() });
export const SlideStatSchema = z.object({ value: z.coerce.string(), label: z.coerce.string() });

// ── Lớp TRANG TRÍ tự do ("ppt-master-lite"): lượt đạo diễn mỹ thuật đặt phần tử lên canvas theo tọa độ %.
//    Renderer vẽ tất định (PPTX + web), có rào an toàn không cho đè vùng nội dung. ──
export const DecorSchema = z.object({
  kind: z.enum(["blob", "ring", "sticker", "chip", "arrow", "line"]),
  x: z.coerce.number().min(-10).max(110),          // % canvas (cho phép tràn mép nhẹ để cắt xén đẹp)
  y: z.coerce.number().min(-10).max(110),
  w: z.coerce.number().min(1).max(70).optional(),   // % — blob/ring/line
  h: z.coerce.number().min(1).max(70).optional(),
  size: z.coerce.number().min(2).max(16).optional(),// % chiều cao canvas — cỡ sticker
  text: z.coerce.string().max(40).optional(),       // emoji của sticker / chữ của chip
  color: z.enum(["brand", "brass", "mist", "white", "ink"]).optional(),
  opacity: z.coerce.number().min(4).max(100).optional(), // %
  x2: z.coerce.number().min(-10).max(110).optional(),    // đầu kia của arrow/line
  y2: z.coerce.number().min(-10).max(110).optional(),
  front: z.boolean().optional(),                    // true = vẽ TRÊN nội dung (chỉ cho sticker/chip nhỏ ở rìa)
});
export const DeckDecorSchema = z.object({
  motif: z.string().optional(),                     // chủ đề thị giác cả deck (để truy vết)
  slides: z.array(z.object({ decor: z.array(DecorSchema).max(7).optional() })).min(1).max(12),
});
export type DecorEl = z.infer<typeof DecorSchema>;
export type DeckDecor = z.infer<typeof DeckDecorSchema>;

export const SlideSchema = z.object({
  title: z.string().min(1),
  icon: z.string().optional(),                     // 1 emoji minh họa chủ đề slide (📊🌡️⚽…)
  bullets: z.array(z.string()).max(8).optional(),
  steps: z.array(z.string()).max(8).optional(),   // quy trình đánh số — badge tròn + dây nối
  cards: z.array(SlideCardSchema).min(2).max(4).optional(), // lưới thẻ màu có icon
  stat: SlideStatSchema.optional(),                // con số LỚN gây ấn tượng (hook)
  table: SlideTableSchema.optional(),              // bảng số liệu thật
  chart: SlideChartSchema.optional(),              // biểu đồ thật (PowerPoint chart / SVG web)
  warn: z.boolean().optional(),                    // slide "Cẩn thận" — tông brass
  notes: z.string().optional(),                    // ghi chú cho giáo viên
  decor: z.array(DecorSchema).max(7).optional(),   // lớp trang trí do lượt "đạo diễn mỹ thuật" đặt
});

export const SlideContentSchema = z.object({ slides: z.array(SlideSchema).min(3).max(12) });

export type SlideChart = z.infer<typeof SlideChartSchema>;
export type SlideTable = z.infer<typeof SlideTableSchema>;
export type SlideV2 = z.infer<typeof SlideSchema>;
export type SlideContentV2 = z.infer<typeof SlideContentSchema>;
