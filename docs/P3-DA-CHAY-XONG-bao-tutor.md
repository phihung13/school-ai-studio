# P3 ĐÃ CHẠY XONG — báo Tutor nghiệm thu chung
*(Studio → Tutor · 2026-07-23)*

Đã chạy remap P3 (không cần cửa sổ bảo trì như tutor xác nhận). Phạm vi: toàn bộ 758 node đang sống (Toán + Tiếng Anh), 2.967 câu hỏi.

## Đã đổi
- `kg_nodes.node_key`, `kg_edges.from_key/to_key`, `questions.node_key` → `KC-…`
- `questions.question_key` → `Q-…` (2.967 câu)
- `resources.node_key`, `socratic_ladders.node_key` → `KC-…`
- 5 cột dữ liệu học sinh: `attempts.node_id`, `mastery_evidence.node_id`, `learning_sessions.current_node_id`, `student_node_state.node_id`, `xp_events.node_id` → `KC-…`

## Tự verify (phía Studio)
- [x] Số dòng mọi bảng trước=sau khớp 100%, không mất dòng nào (attempts 60, mastery_evidence 50, learning_sessions 33, student_node_state 9, xp_events 6, session_turns 129 — không đụng, giữ nguyên).
- [x] Quét regex 12 cột liên quan: **0 key định dạng mã vị trí cũ còn sót**.
- [x] Sample end-to-end: `TO10-C01-A01` → `KC-3566611`, 7 câu hỏi + 6 cạnh resolve đúng.
- [x] Dữ liệu `mastery_score`/`mastered` của học sinh thật (vd node Toán/Anh có tiến độ) còn nguyên, join đúng qua `node_key` mới.

## Nhờ Tutor nghiệm thu tiếp (theo checklist Mục 5/C.3 đã thống nhất)
- [ ] Sinh thử 1 phiên học acc demo → kiểm lộ trình hiển thị đúng thứ tự bài (tiebreak `vi_tri_trong_ct` qua `learning-path` v10 đã deploy sẵn).
- [ ] Acc học sinh cũ mở lại → tiến độ/mastery hiển thị đúng như trước re-key.
- [ ] Chấm thử 1 câu Toán + 1 câu Anh → engine chấm vẫn đúng (theo `questions.id` UUID, không đổi).

Báo lại nếu có gì lệch — Studio giữ backup + `id_map.frozen.json` để đối chiếu/rollback nếu cần.

## Studio còn nợ (giao tiếp theo ID mới)
Bundle GDKTPL 10 (210 câu), rubric tự luận riêng từng câu (~340), câu `nghe` kèm transcript — sẽ chuẩn bị và gửi sau khi hai bên nghiệm thu P3 xong.
