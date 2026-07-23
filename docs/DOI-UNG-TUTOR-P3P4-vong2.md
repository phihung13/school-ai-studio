# ĐỐI ỨNG STUDIO — vòng 2 (trả lời đối ứng Tutor 23/07)
*(Studio → Tutor · 2026-07-23)*

Đã đọc đối ứng của các anh (Mục A–E). Cảm ơn đã audit kỹ + phát hiện đúng điểm hợp đồng thiếu (thứ tự bài). Trả lời từng phần:

## 1. Tín hiệu thứ tự bài (Mục B) — CHỐT phương án 1 của các anh
Đồng ý **giữ `kc_registry.vi_tri_trong_ct` truy vấn được**, tutor tiebreak theo cột đó thay vì `node_key`. Đây đúng là thiết kế Studio đã định từ đầu (không phải bàn thêm) — cột này lưu **mã vị trí cũ nguyên văn** (không phải rank số), zero-pad theo từng đoạn (`C01`..`C10`, `A01`..`W02`...) nên so chuỗi ra đúng thứ tự trong cùng lớp/môn. Khớp đúng ví dụ các anh nêu.

## 2. Đã XỬ LÝ cảnh báo E.3 — kc_registry đủ cho toàn bộ node ĐANG SỐNG bên Tutor
Kiểm tra lại `kg_nodes` bên các anh: **chỉ 2 môn thực sự đã nạp** — `Anh` (341 node) + `Toan` (417 node), tổng **758 node**, KHÔNG phải cả 12 môn như dự tính ban đầu của Studio (12.907 là toàn bộ kho Studio, phần lớn chưa được tutor mở — đúng như tài liệu "onboarding môn mới" trước đó đã ghi).

⇒ Đã **INSERT bổ sung 554 dòng** vào `kc_registry` (341 Tiếng Anh 10 + 2 seed `T_HS`/`T_HSB2`/`E_PRES3S` + 213 Toán lớp 9 còn thiếu — Toán 10 vốn đã có sẵn 204/204 như các anh xác nhận), dọn thêm 3 dòng rác trỏ atom không còn tồn tại. Verify: **anti-join `kg_nodes.node_key` ↔ `kc_registry.vi_tri_trong_ct` = 0 dòng thiếu** — mọi node đang sống bên Tutor giờ đều tra được `vi_tri_trong_ct` qua KC tương ứng. `kc_registry` hiện 3.417 dòng (chưa phủ hết 12.907 — phần còn lại thuộc các môn Tutor chưa mở, sẽ bổ sung khi các anh mở môn mới, không chặn cửa sổ lần này).

**Các anh có thể deploy thử `learning-path` (đã sửa tiebreak) và test ngay trên dữ liệu Toán+Anh hiện tại** nếu muốn kiểm chứng sớm trước cửa sổ chính thức — kc_registry đã sẵn sàng cho việc đó.

## 3. Trả lời còn lại
- **question_key an toàn** (E.1) — ghi nhận, đồng ý điểm cosmetic `teacher-stats.order` tutor tự sửa ngoài cửa sổ.
- **Không thiếu cột ẩn nào** (E.2) — khớp phạm vi remap 2 bên đã liệt kê, không cần thêm gì.
- **P4 code đã xong, chưa deploy** (E.4) — ghi nhận, deploy trong cửa sổ sau khi Studio chạy P3 xong.
- **Ai remap dữ liệu học sinh** — xác nhận: Studio chạy (transaction + backup), Tutor verify theo checklist Mục C.3 đã thống nhất.

## 4. CÒN LẠI — cần Tutor chốt
1. **Ngày giờ cụ thể cửa sổ bảo trì** (ngoài giờ học, khoá login 30–60'). Studio gửi `id_map.frozen.json` (phần liên quan Toán+Anh) trước ≥1 ngày.
2. Xác nhận lại: vì phạm vi thực tế chỉ 758 node (Toán+Anh) chứ không phải 12.907, cửa sổ có thể NGẮN hơn dự tính ban đầu — các anh thấy tối muộn trong tuần có ổn hơn cuối tuần không?

Sau khi chốt ngày, Studio dựng script remap P3 chính thức (transaction, đối chiếu số dòng trước/sau, rollback sẵn) và gửi trước cho các anh rà.
