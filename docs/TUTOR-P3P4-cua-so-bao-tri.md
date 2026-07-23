# GỬI ĐỘI TUTOR — Cửa sổ bảo trì đổi ID (P3 + P4)

*(Studio → Tutor · 23/07 · Studio đã re-key XONG phía mình, chờ chốt cửa sổ để đồng bộ DB dùng chung)*

## 0. Tình hình
Hai app dùng chung DB `gxbxsdhvtwtjkfygetzb`. Ta bỏ khoá theo **mã vị trí** (`TA10-C04-E01` — đổi mỗi lần tái phân rã chương trình) sang **ID bất biến vô nghĩa**:

| Thực thể | ID mới | Ví dụ |
|---|---|---|
| Node (nguyên tử) | `KC-` + 7 số ngẫu nhiên | `TO10-C01-A01` → `KC-3566611` |
| Câu hỏi (khoá) | `Q-` + 7 số tuần tự | `TO10-C01-A01-Q10` → `Q-…` |
| Cạnh | `E-` + 7 số | |
| Học liệu | `R-` + 7 số | |
| Thang Socratic | `L-` + 7 số | |

**Studio đã sinh toàn bộ ID + đã cutover app Studio (LIVE, chạy tốt).** Bảng ánh xạ `id_map` đóng băng ở Studio (giữ nguyên 2.665 KC đã có trong `kc_registry` của các anh, chỉ sinh mới phần còn thiếu). Studio là bên sinh ID.

## 1. TIN VUI: tiến độ học sinh gần như KHÔNG rủi ro
Đã soi schema thật của các anh:
- `attempts.question_id`, `mastery_evidence.question_id`, `submissions.question_id` = **UUID `questions.id`** (bất biến) → **KHÔNG đụng tới**. Tiến độ làm bài của học sinh **an toàn tuyệt đối**.
- Chỉ các cột **node** dùng mã vị trí cần đổi sang KC: `attempts.node_id`, `mastery_evidence.node_id`, `learning_sessions.current_node_id`, `student_node_state.node_id`, `xp_events.node_id`. Đã kiểm anti-join: **0 dòng mồ côi** — mọi giá trị đều map sạch sang KC.

## 2. Studio sẽ chạy trong cửa sổ (Studio có service key, 1 transaction, đối chiếu số dòng trước=sau)
Đổi giá trị (join vẫn theo cột cũ, chỉ đổi VALUE):
- **node_key → KC**: `kg_nodes.node_key`, `kg_edges.from_key/to_key`, `kg_tiers.node_key`, `questions.node_key`, `resources.node_key`, `socratic_ladders.node_key`, + 5 cột học sinh ở Mục 1.
- **question_key → Q-**: chỉ `questions.question_key` (dữ liệu học sinh dùng UUID nên không ảnh hưởng).
- **cạnh/học liệu/thang → E-/R-/L-** (id riêng, nếu là text): `kg_edges`, `resources`, `socratic_ladders`.
- **`kc_registry` dựng lại đủ 12.907 dòng**: `node_key` = KC, `vi_tri_trong_ct` = **rank đệm-0** (số thứ tự bài toàn cục môn→lớp→chương→bài) — để phục vụ Mục 3b.

Rollback: Studio giữ backup + có thể revert bằng id_map. Nếu verify hỏng → revert cả hai.

## 3. CẦN TUTOR làm (code app P4) — deploy TRONG CÙNG cửa sổ
Engine các anh agnostic theo khoá nên **không viết lại engine**, chỉ:
1. **Bỏ giả định `node_key`/`question_key` = mã vị trí.** Coi là chuỗi mờ (`KC-…`/`Q-…`). Đừng parse môn/chương từ key — lấy từ **cột `subject`/`chapter` của `kg_nodes`**.
2. **(BẮT BUỘC) `learning-path` đang tiebreak topo-sort bằng `node_key`** (mã vị trí đệm-0 nên ra đúng thứ tự bài). KC ngẫu nhiên làm MẤT tín hiệu này → lộ trình loạn. **Đổi tiebreak sang `kc_registry.vi_tri_trong_ct`** (Studio đảm bảo = rank đệm-0 chuẩn thứ tự bài). Đây là lý do P3↔P4 phải cùng cửa sổ.
3. **Hiển thị**: chỗ nào show mã vị trí cho GV/HS → đổi sang `label`/KC (mã vị trí cũ vẫn tra được ở `kc_registry.vi_tri_trong_ct` nếu cần).
4. **Importer bundle** (mở môn mới từ Studio): nhận `node_key`=KC, `question_key`=Q-.

## 4. CẦN TUTOR xác nhận lại cho Studio (để chốt zero-error)
1. **`question_key` có được dùng ở đường phục vụ (serving) / chấm bài không, hay chỉ dùng lúc import + join UUID?** Nếu chỉ import → đổi `question_key`→Q- an toàn tuyệt đối. Nếu có logic đọc `question_key`, báo Studio.
2. **Còn bảng/cột nào trỏ tới node/câu bằng mã vị trí mà Studio không thấy** trong code phía các anh không? (Studio đã quét 17 cột text, nhưng logic ẩn trong edge function thì chỉ các anh biết.)
3. **Chốt cửa sổ bảo trì**: khung giờ ít học sinh, khoá đăng nhập ~30–60 phút. Đề xuất quy trình: (a) khoá login → (b) Studio chạy remap + verify đếm dòng → (c) Tutor deploy P4 → (d) cùng nghiệm thu → (e) mở login. Hỏng bất kỳ bước → rollback.

## 5. Nghiệm thu (cả hai cùng ký)
- [ ] `count(attempts)`, `count(mastery_evidence)`, `count(student_node_state)` trước = sau (không mất dòng nào).
- [ ] Học sinh cũ mở lại → tiến độ/mastery còn nguyên (UUID câu không đổi nên phải nguyên).
- [ ] Lộ trình học đúng thứ tự bài (tiebreak `vi_tri_trong_ct`).
- [ ] Node hiển thị theo KC/label; sync Studio→tutor chạy theo `node_key`=KC / `question_key`=Q-.
- [ ] Không còn mã vị trí cũ trong cột khoá (chỉ còn ở `kc_registry.vi_tri_trong_ct` làm tham chiếu).

## 6. Studio còn nợ (giao SAU khi re-key, theo ID mới)
- Bundle **GDKTPL 10** (210 câu) — `node_key`=KC, `question_key`=Q-.
- **Rubric từng câu tự luận** (~340 câu) — 3 khuôn kỹ năng đã chốt.
- Câu **`nghe`** kèm transcript.

**Tóm lại các anh cần trả lời 3 ý ở Mục 4 + báo lịch cửa sổ. Studio lo toàn bộ phần đổi DB.**
