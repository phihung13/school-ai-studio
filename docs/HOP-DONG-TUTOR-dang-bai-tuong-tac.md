# HỢP ĐỒNG KỸ THUẬT — TUTOR: DẠNG BÀI TƯƠNG TÁC & ONBOARDING MÔN MỚI
*(Từ đội Studio / school-ai gửi đội Tutor — 2026-07-22)*

## 0. Bối cảnh
- **Studio (school-ai)** = nơi soạn/duyệt tri thức + ngân hàng câu hỏi. **Tutor** = app học sinh học & luyện. Hai app **dùng chung 1 Supabase** (`gxbxs…` — "app sản xuất").
- Đã đồng bộ **1.551 câu Tiếng Anh 10** từ Studio → bảng `public.questions` của tutor (version **"Tiếng Anh 10 — Global Success"**). Khoá liên kết: **`node_key` = mã atom Studio** (vd `TA10-C04-E01`).
- Văn bản này liệt kê những gì **tutor cần xây/hoàn thiện** để hiển thị & chấm đúng các dạng câu đã đẩy, và cách **mở thêm môn mới**.

## 1. Ảnh chụp schema `questions` (để đối chiếu — KHÔNG đổi)
| Cột | Ý nghĩa |
|---|---|
| `dang_cau_hoi` | 1 trong **17 dạng** (CHECK cho phép): mcq, dung_sai, dien_dap_an, dien_khuyet, sap_xep, noi_cot, nhieu_buoc, tu_luan_ngan, tim_loi, viet_doan, giai_thich_cho_ban, du_doan_giai_thich, phan_bien, van_dung_thuc_te, phan_tu, noi, nghe |
| `loai_danh_gia` | `objective` (chấm máy, phải có `dap_an`) hoặc `rubric` (phải có `rubric`) |
| `nhom_cham` | `auto` / `rubric_agent` / `speaking_agent` |
| `distractors` | jsonb `[{phuong_an, quan_niem_sai}]` (dùng cho mcq) |
| `rubric` | jsonb `[{tieu_chi, thang_muc:[4 mức]}]` (câu tự luận) |
| Ràng buộc đặc biệt | `nghe`→`audio_uri`; `tim_loi`→`loi_cai_san[]`; `nhieu_buoc`→`buoc[3–5]`; `phan_tu`→`tinh_mastery=false` |

## 2. CẦN XÂY UI TƯƠNG TÁC (học sinh thao tác trực tiếp)
Các dạng dưới đây Studio đã đẩy nội dung; tutor cần **giao diện thao tác + bộ chấm** tương ứng:

| Dạng | UI đề xuất | Chấm |
|---|---|---|
| **sap_xep** | **Kéo–thả** để xếp thứ tự các mục | So khớp thứ tự với `dap_an` (vd `"B, C, A, D"`) |
| **noi_cot** | **Kéo–thả nối** 2 cột (1↔A, 2↔B…) | So khớp cặp với `dap_an` (vd `"1-B, 2-C, 3-A"`) |
| **mcq** | Chọn 1 (radio) + hiện `distractors` làm phương án nhiễu | Khớp `dap_an` |
| **dung_sai** | Nút Đúng / Sai | Khớp `dap_an` |
| **dien_khuyet / dien_dap_an** | Ô nhập ngắn | So khớp (chuẩn hoá hoa/thường, bỏ dấu cách thừa) |
| **phan_tu** | Chọn phần tử **thuộc / không thuộc** tập | `tinh_mastery=false` (đã set) |

> Hiện `sap_xep` và `noi_cot` đang lưu dạng **objective** (đáp án dạng chuỗi). Khi tutor có UI kéo–thả, chỉ cần đọc `dap_an` để dựng đáp án đúng — **không cần Studio đổi dữ liệu**.

## 3. CẦN DỮ LIỆU ĐẶC BIỆT (Studio hiện chưa cấp — cần thống nhất)
| Dạng | Thiếu | Hiện xử lý | Đề xuất |
|---|---|---|---|
| **nghe** (listening) | `audio_uri` | **Bỏ qua** (3 câu TA10) | Tutor sinh audio bằng TTS từ `noi_dung`, HOẶC Studio bổ sung link audio |
| **tim_loi** (tìm lỗi) | `loi_cai_san[]` | Hạ về `dien_dap_an` | Nếu muốn giữ UI tìm-lỗi: định khuôn `loi_cai_san` (mảng {vị trí lỗi, sửa đúng}); Studio cấp theo khuôn đó |
| **nhieu_buoc** (nhiều bước) | `buoc[3–5]` | Hạ về `viet_doan` (tự luận) | Nếu muốn UI từng-bước: định khuôn `buoc`; Studio tách bước từ lời giải |

## 4. Rubric chấm tự luận
Câu mở (`viet_doan`, `phan_bien`, `tu_luan_ngan`, `giai_thich_cho_ban`, `du_doan_giai_thich`, `van_dung_thuc_te`, `noi`) đang gắn **rubric CHUNG 3 tiêu chí** (Nội dung / Ngôn ngữ / Mạch lạc, thang 0–3).
→ Đề xuất: tutor định khuôn rubric riêng **theo kỹ năng** (Writing / Speaking / Reasoning). Nếu tutor chốt khuôn, **Studio cấp rubric riêng từng câu** (lời giải gốc đã chứa tiêu chí chấm). `nhom_cham` nên là `speaking_agent` cho dạng `noi`.

## 5. Onboarding MÔN MỚI (GDKTPL 10 / Công nghệ 8–9 / GDCD 9 — đã có trong Studio)
Các môn này **đã nạp vào Studio** (atom + cạnh + câu hỏi) nhưng **tutor chưa mở** (chưa có version + node). Để mở:
1. Tạo `kg_versions` (subject, label, `status='published'`).
2. Nạp `kg_nodes`: `node_key` = **mã atom Studio** (vd `KP10-C01-A01`, `CN08-C01-A01`, `GD09-C01-A01`), kèm subject/grade/chapter/cluster/label.
3. Nạp `kg_edges`: `from_key`/`to_key` = mã atom.
4. Nạp `questions` (như TA10).

**Studio sẵn sàng cấp** trọn bộ dữ liệu theo mã atom cho từng môn. Cần tutor: (a) chốt enum `subject`, (b) tạo version, (c) xác nhận khuôn node/edge/question — rồi Studio đẩy.

## 6. Đối ứng từ Studio
- Cấp dữ liệu KG (atom/edge) + câu hỏi theo **mã atom bất biến**.
- Đồng bộ lại khi kho cập nhật (idempotent theo `question_key` / `node_key`).
- Cấp `rubric`/`loi_cai_san`/`buoc`/`audio` theo khuôn khi tutor chốt.

## 7. Ưu tiên đề xuất
1. **UI kéo–thả** cho `sap_xep` + `noi_cot` (nhiều câu, tương tác cao). 
2. **Rubric theo kỹ năng** cho câu tự luận.
3. **Audio (TTS)** cho `nghe`.
4. **Mở môn mới** (bắt đầu GDKTPL 10 — đã có 210 câu Trạm 3).
