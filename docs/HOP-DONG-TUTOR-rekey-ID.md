# HỢP ĐỒNG KỸ THUẬT — RE-KEY ID ĐỒNG NHẤT
*(Đội Studio → đội Tutor · 2026-07-23)*

## 0. Vì sao re-key
Hai app dùng chung DB (`gxbxs`) đang khoá theo **mã atom vị trí** (`TA10-C04-E01`). Mã này **đổi khi tái cấu trúc chương trình** (đã xảy ra: Địa10 tái phân rã, 295 mã cũ). Ta chuyển sang **ID bất biến, vô nghĩa**:

| Thực thể | ID mới | Sinh |
|---|---|---|
| Node | `KC-` + 7 số | ngẫu nhiên (giữ KC đã có trong `kc_registry`) |
| Câu hỏi | `Q-` + 7 số | tuần tự 1→n |
| Cạnh | `E-` + 7 số | tuần tự |
| Tài nguyên | `R-` + 7 số | tuần tự |
| Thang Socratic | `L-` + 7 số | tuần tự |

**Studio là bên sinh ID.** Bảng ánh xạ dùng chung: `public.id_map(kind, old_key, new_id, vi_tri)`.

## 1. Đổi ở DB dùng chung (Studio chạy, có backup + transaction)
- `kg_nodes.node_key` : mã atom → **KC**
- `questions.node_key` → **KC** ; `questions.question_key` → **Q-**
- `kg_edges` (id/from_key/to_key) → **E-** / KC
- `resources` → **R-** ; `socratic_ladders` → **L-**
- `kc_registry` : `node_key` giữ KC, `vi_tri_trong_ct` giữ mã cũ (dùng khi tra cứu/di trú)
- **Dữ liệu học sinh** (`attempts`, `mastery_evidence`, `learning_sessions`, `session_turns`, `student_node_state` …) : mọi tham chiếu `node_key`/`question_key` cũ → mới, remap **trong cùng transaction**. Studio lo phần này; Tutor **rà đối chiếu số dòng trước/sau**.

## 2. CẦN Tutor làm (code app)
Engine của các anh **agnostic theo khoá** (như đã ghi) → **không phải viết lại engine**, chỉ:
1. **Bỏ giả định `node_key`/`question_key` = mã atom.** Coi chúng là **chuỗi mờ** (KC-…/Q-…). Không parse ra môn/chương từ key nữa — lấy môn/chương từ **cột `subject`/`chapter` của `kg_nodes`** (đã có).
2. **Hiển thị**: nếu UI đang show mã atom cho GV/HS → đổi sang show `label`/KC; mã vị trí cũ **không còn**.
3. **Join** vẫn theo `node_key`/`question_key` (giờ là KC/Q-) — không đổi logic, chỉ đổi giá trị.
4. **Importer bundle** (mở môn mới): nhận `node_key`=KC, `question_key`=Q- thay vì mã atom. Studio sẽ đẩy bundle **theo ID mới**.

## 3. Nhịp phối hợp (QUAN TRỌNG)
- Studio gửi trước: `id_map` đầy đủ + xác nhận lịch.
- **P3 (đổi DB) và P4 (đổi code tutor) phải trong CÙNG một cửa sổ bảo trì** — tránh cảnh DB-mới-nhưng-code-cũ khiến học sinh gặp lỗi. Đề xuất: chọn khung giờ ít học sinh, khoá đăng nhập ~30–60 phút.
- Có **rollback**: nếu verify hỏng, Studio revert DB bằng backup + `id_map`; tutor revert code.

## 4. Nghiệm thu (cả hai cùng ký)
- [ ] Học sinh cũ mở lại → **tiến độ/mastery còn nguyên** (đếm dòng attempts/mastery trước=sau).
- [ ] Câu hỏi render đúng theo `Q-…` ; node theo `KC-…`.
- [ ] Sync Studio→tutor chạy theo khoá mới (idempotent).
- [ ] Không còn tham chiếu mã atom cũ nào trong bảng học sinh.

## 5. Về các mục Tutor đang xin Studio (rubric riêng / câu nghe / bundle GDKTPL)
Studio sẽ cấp **theo ID mới** (sau khi re-key), để khỏi onboard bằng mã atom rồi phải đổi lần nữa:
- **Bundle GDKTPL 10** (210 câu) — theo khuôn bundle của các anh, nhưng `node_key`=KC, `question_key`=Q-.
- **Rubric riêng từng câu** (~340 câu tự luận) — theo 3 khuôn kỹ năng các anh đã chốt.
- **Câu `nghe`** kèm transcript trong `noi_dung`.

## 6. Xác nhận cần từ Tutor
1. Đồng ý re-key sang KC/Q/E/R/L (bỏ giả định key = mã atom)?
2. Chốt **cửa sổ bảo trì** để đồng bộ P3↔P4.
3. Ai remap dữ liệu học sinh — Studio chạy (có service key) hay Tutor tự chạy theo `id_map`? (Đề xuất: Studio chạy, Tutor giám sát + verify.)
