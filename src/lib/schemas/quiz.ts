import { z } from "zod";

// Schema chặt cho quiz: mỗi câu gắn DOK + (nếu là mcq) một phương án nhiễu bám quan_niem_sai thật từ đồ thị.
export const QuizQuestionSchema = z
  .object({
    type: z.enum(["mcq", "tf", "fill"]),
    dok: z.number().int().min(1).max(3),
    q: z.string().min(1),
    // KHÔNG .min(2) ở đây: model hay trả options:[] cho câu tf/fill → fail oan cả retry
    // (chính là thủ phạm khiến quiz rơi về mock trước 2026-07-09). mcq ≥2 đã có refine bên dưới.
    options: z.array(z.coerce.string()).max(6).optional(),
    answer: z.union([z.number().int(), z.boolean(), z.string()]),
    explanation: z.string().min(1),
    misconceptionRef: z.string().optional(),
  })
  .refine((q) => q.type !== "mcq" || (Array.isArray(q.options) && q.options.length >= 2), {
    message: "Câu mcq phải có ít nhất 2 phương án",
    path: ["options"],
  });

export const QuizContentSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1).max(12),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizContent = z.infer<typeof QuizContentSchema>;
