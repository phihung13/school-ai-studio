// ══════════════════════════════════════════════════════════════════════════
// BỘ DỰNG VIDEO — phần CỐ ĐỊNH của mọi kịch bản video (viết 1 lần, dùng chung).
// AI chỉ sinh phần THEO ATOM (kịch bản 7 nhịp + veoAction/veoCast từng cảnh);
// các khối dưới đây được app GHÉP SẴN vào bản xuất → ra trọn "prompt pack" như
// master, không tốn token sinh lại mỗi lần và luôn nhất quán giữa các video.
// Cast cố định: Dương (người dẫn/avatar) · Leo (linh vật) · Tim + An (học sinh).
// ══════════════════════════════════════════════════════════════════════════

// [STYLE] — khối phong cách toàn cục, DÁN vào MỌI prompt Veo (Veo không có trí nhớ).
export const STYLE_BLOCK =
`Cinematic documentary style, shot on 35mm lens, shallow depth of field, warm natural morning sunlight, soft golden tones, realistic Vietnamese setting, authentic Vietnamese people, high detail, smooth stabilized camera movement, 4K photorealistic. No subtitles, no captions, no text overlay, no watermark, no brand logos.`;

// [SCHOOL] — bối cảnh sân trường (dùng cho các cảnh ở trường).
export const SCHOOL_SETTING =
`A sunny Vietnamese secondary school courtyard in the morning: clean concrete yard, rows of green trees along the edges, yellow two-story school building with open corridors, a tall white flagpole with the red flag with yellow star at the center of the yard, students in white shirts with red scarves walking in the background.`;

// Character Bible — mô tả TIẾNG ANH từng nhân vật, ghép vào prompt Veo của cảnh có họ.
// LEO = tạm dùng mô tả chuẩn; THAY bằng thiết kế mascot chính thức của trường khi có.
export const CHAR_BIBLE: Record<string, string> = {
  TIM: `Tim: a 14-year-old Vietnamese schoolboy, short black hair, bright curious eyes, white short-sleeve school shirt with a red scarf, dark blue trousers, white sneakers, energetic and confident posture.`,
  AN: `An: a 14-year-old Vietnamese schoolgirl, black hair in a neat ponytail, white school shirt with a red scarf, dark blue skirt, calm and clever expression, holding a small notebook.`,
  LEO: `LEO (school mascot — REPLACE with the school's official mascot design when finalized): a friendly stylized 3D lion mascot, Pixar-animation style, round body, big warm amber eyes, soft golden-orange mane, wearing a navy school vest with a small crest, expressive cartoon face, bouncy playful energy; blends into the live-action scene like a CGI character in a family movie, casting a soft real shadow.`,
};

// Ghép prompt Veo HOÀN CHỈNH cho một cảnh: [STYLE] + bible nhân vật có mặt + hành động cảnh.
// Veo không nhớ giữa các lần sinh nên mỗi prompt phải TỰ CHỨA đủ style + nhân vật.
export function assembleVeoPrompt(action: string, cast: string[] = []): string {
  const blocks: string[] = [STYLE_BLOCK];
  for (const c of cast) {
    const b = CHAR_BIBLE[String(c).toUpperCase()];
    if (b) blocks.push(b);
  }
  blocks.push(String(action || "").trim());
  return blocks.filter(Boolean).join("\n\n");
}

// Ghi chú cast + phân kênh sản xuất — TIÊM vào prompt AI để kịch bản dùng đúng dàn nhân vật
// và điền đúng "role"/"veoAction"/"veoCast" từng cảnh.
export const CAST_DIRECTIVE_VI =
`# DÀN NHÂN VẬT CỐ ĐỊNH (dùng ĐÚNG các nhân vật này, KHÔNG đổi tên, KHÔNG thêm người thứ năm):
- Dương: NGƯỜI DẪN (thầy giáo, giọng chính, ấm áp gần gũi) — xuất hiện dạng avatar; đảm nhận nhịp 2 và phần GIẢI ĐÁP checkpoint (nhịp 5).
- Leo: LINH VẬT sư tử hoạt hình, hài hước, chen 1-2 câu tếu tạo tiếng cười (comic relief) — xuất hiện ở cold open và rải rác.
- Tim: học sinh nam 14 tuổi, hiếu động, TỰ TIN (hay tuyên bố/đoán SAI đầy chắc nịch).
- An: học sinh nữ 14 tuổi, điềm tĩnh, thông minh.
Cold open (nhịp 1) do Tim + An đóng (cãi nhau/cá cược tạo hook) + Leo pha trò. Dương giảng và giải đáp.

# KÊNH SẢN XUẤT — điền trường "role" MỖI cảnh (quyết định cảnh đó dựng bằng công cụ nào):
- "veo"  = quay/dựng cảnh ĐỜI THẬT bằng AI video: nhịp 1 (sân trường, Tim/An/Leo), nhịp 6 (cảnh ứng dụng đời thật), phần CLIFFHANGER của nhịp 7. → BẮT BUỘC có "veoAction" (tiếng Anh) + "veoCast".
- "avatar" = Dương nói trực tiếp, dựng trên nền tảng avatar (KHÔNG Veo): nhịp 2 (và có thể phần giải đáp nhịp 5). → KHÔNG cần veoAction.
- "graphics" = đồ hoạ toán / thẻ câu hỏi, làm bằng Canva/AE (KHÔNG Veo — Veo viết ký hiệu & chữ tiếng Việt SAI): nhịp 3, nhịp 4 (giảng cốt lõi), thẻ câu hỏi nhịp 5. → KHÔNG cần veoAction.

# VỚI CẢNH role="veo":
- "veoAction": mô tả TIẾNG ANH cảnh quay (góc máy + hành động + bối cảnh), gói trong ~8 giây, KHÔNG thoại (ambient sound thôi), KHÔNG chèn chữ. KHÔNG chép lại mô tả nhân vật/phong cách — hệ thống TỰ ghép [STYLE] + mô tả nhân vật vào trước veoAction.
- "veoCast": mảng nhân vật cố định XUẤT HIỆN trong cảnh, chọn từ ["TIM","AN","LEO"] (Dương KHÔNG quay Veo). Cảnh không có nhân vật cố định (kỹ sư, dòng sông, nhà máy…) → veoCast = [] và tả người/vật đó ngay trong veoAction.
- Tránh cho nhân vật mấp máy môi thoại tiếng Việt trong Veo (khẩu hình sai) — cho họ quay nghiêng/cử chỉ; thoại lồng ở hậu kỳ.`;

// ── P1 — Cơ chế "video tự ngưng" (cố định, đính vào mọi bản xuất) ──
export const PAUSE_MECHANISM_VI =
`CƠ CHẾ "VIDEO TỰ NGƯNG" (dựng cố định, không cần app can thiệp):
• Pattern P1 — Ngưng suy nghĩ (nhịp 3 + câu hỏi mini): đóng băng khung hình → thẻ câu hỏi + vòng đếm ngược 5 giây góc phải + âm "tích tắc" nhỏ + dòng chữ cố định "⏸ Con có thể bấm dừng nếu cần thêm thời gian" → hết 5 giây tự chạy tiếp và giải đáp nhanh.
• Pattern P2 — Ngưng checkpoint (nhịp 5): như P1 nhưng đếm ngược 7 giây, NHẠC NỀN TẮT HẲN (im lặng tạo áp lực suy nghĩ); sau đó Dương giải đáp CẢ HAI hướng: vì sao đáp đúng + vì sao (các) phương án nhiễu sai (nêu đúng quan niệm sai).
• Tách 2 video (tuỳ chọn): nếu checkpoint là câu Bậc 2–3 cần làm nháp thật (>30 giây), tách tại đó — Video A kết bằng chính câu hỏi (thành cliffhanger), Video B mở bằng lời giải.`;

// ── P5 — Hướng dẫn kỹ thuật Veo + dựng (cố định) ──
export const VEO_TECH_GUIDE_VI =
`HƯỚNG DẪN KỸ THUẬT (Veo 3 + hậu kỳ):
• Trình tự: tạo ẢNH CHUẨN nhân vật (Tim, An, Leo) trước → dùng làm reference/ingredient cho mọi shot có nhân vật → nháp bằng Veo Fast, chốt hình mới sinh bản final chất lượng cao.
• Nối 2 clip 8s cùng cảnh: xuất khung cuối clip trước → làm ảnh đầu vào (image-to-video) cho clip sau, prompt "the camera continues the same movement…"; tránh đổi hướng máy giữa 2 clip.
• Chống chữ ma: LUÔN giữ "No subtitles, no captions, no text overlay" trong prompt — chữ tiếng Việt của Veo gần như chắc chắn sai; MỌI chữ gắn ở hậu kỳ.
• Đoạn avatar Dương: KHÔNG sinh bằng Veo (chính sách + khẩu hình tiếng Việt) — dựng trên nền tảng avatar (HeyGen…) từ ảnh/giọng thật, ghép lên nền.
• Đồ hoạ toán (nhịp 4) & thẻ câu hỏi: làm bằng Canva/PowerPoint/After Effects — Veo không vẽ đúng ký hiệu toán.
• QC từng clip trước khi ghép, LOẠI nếu dính: tay/ngón dị dạng; cờ/đồng phục sai; chữ vô nghĩa trong nền; vật lý phi lý (bóng ngược, thang lơ lửng); mặt nhân vật lệch ảnh chuẩn; logo thương hiệu thật lọt khung.
• Thoại lồng tiếng Việt hậu kỳ: giọng Dương clone từ giọng thật; giọng Leo chọn 1 giọng hoạt hình riêng và GIỮ CỐ ĐỊNH (tài sản thương hiệu âm thanh).
• Dựng: Premiere/CapCut; nhạc nền motif cố định cho cả series; phụ đề tiếng Việt khớp 100%; xuất 16:9 bản chính + cắt 9:16 đoạn nhịp 1–2 (~30s) làm teaser marketing.`;

// ── P6 — Checklist trước khi phát hành (cố định) ──
export const RELEASE_CHECKLIST_VI =
`CHECKLIST TRƯỚC KHI PHÁT HÀNH:
☐ Giáo viên bộ môn duyệt: số liệu/ví dụ, đáp án checkpoint, thuật ngữ đúng SGK, không vượt chuẩn lớp.
☐ Đủ ≥20% thời gian CHỦ ĐỘNG (dự đoán + câu mini + checkpoint + brain-dump + nhiệm vụ về nhà).
☐ Hook ≤ 22 giây, không logo trước hook; intro thương hiệu ≤ 2 giây đặt SAU nhịp 1.
☐ Hai pattern tự ngưng đúng chuẩn (5s / 7s, dòng nhắc bấm dừng, nhạc tắt ở P2).
☐ Cliffhanger trỏ ĐÚNG node kế tiếp trong KG (ghi metadata: node hiện tại, node tập sau, ID câu hỏi checkpoint).
☐ Test với 5–10 học sinh thật trước khi sản xuất loạt (xem hết không, trả lời checkpoint, có bấm dừng, có đòi xem tập sau).`;
