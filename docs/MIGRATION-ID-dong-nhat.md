# KẾ HOẠCH DI TRÚ — ĐỒNG NHẤT ID (Studio + Tutor)
*(Nội bộ Studio · 2026-07-23 · chờ Hùng duyệt trước khi chạy khâu GHI)*

## 1. Chuẩn ID mới (chốt)
| Thực thể | Khuôn | Cách sinh |
|---|---|---|
| Điểm tri thức (atom/node) | `KC-` + 7 số | **NGẪU NHIÊN** duy nhất. **Giữ 2.685 KC đã có** trong `kc_registry`; chỉ sinh mới cho atom chưa có. |
| Câu hỏi | `Q-` + 7 số | **TUẦN TỰ 1→n** |
| Cạnh (quan hệ) | `E-` + 7 số | **TUẦN TỰ 1→n** |
| Tài nguyên (học liệu/asset) | `R-` + 7 số | **TUẦN TỰ 1→n** |
| Thang Socratic | `L-` + 7 số | **TUẦN TỰ 1→n** |

- **KC là mã ĐẠI DIỆN** — mã vị trí cũ (`TA10-C04-E01`) **KHÔNG còn là cột sống**, chỉ tồn tại trong **bảng ánh xạ backup** (rollback), verify xong thì bỏ.
- **Thứ tự đánh số tuần tự (Q/E/R/L)**: MỘT biến toàn cục, **liên tục không reset**, duyệt **môn → lớp → chương → bài → atom**. Q/E/R theo rank của atom cha; hết Toán (mọi lớp) mới sang Văn, số chạy tiếp.

## 2. Nguồn sự thật & bảng ánh xạ
- **Studio là bên GHI (authority)** sinh mọi ID.
- **Bảng ánh xạ đặt trong Supabase dùng chung** (`gxbxs`) — vd `public.id_map(kind, old_key, new_id, vi_tri, created_at)` — để cả 2 app dùng chung + covers **entity chỉ-có-tutor** (Socratic ladder, câu tutor-native).
- Quy trình sinh ID đọc **CẢ hai DB** (Studio SQLite + Supabase) để mapping đầy đủ.

## 3. Các giai đoạn (mỗi khâu GHI có checkpoint + rollback)
**P0 — Đóng băng + backup.** Snapshot `studio.db` + backup Supabase (pg_dump/point-in-time). Tạm dừng ghi từ cả 2 app. *(không phá gì)*

**P1 — Sinh bảng ánh xạ.** Studio đọc cả 2 DB → gán KC (giữ cũ, sinh mới random không trùng) + Q/E/R/L tuần tự theo thứ tự Mục 1 → ghi `id_map`. **KHÔNG đổi dữ liệu thật.** → Hùng xem mapping trước.

**P2 — Di trú STUDIO.** Áp `id_map`: atom.id/code→KC, question.id→Q-, edge.id→E-, asset.id→R-; cập nhật MỌI tham chiếu (edges from/to, question.atomId, package.atomId, asset.packageId, tree). **+ Sửa code Studio** (xem Rủi ro #1). Verify: cây/đồ thị/gói/học liệu mở đúng.

**P3 — Di trú TUTOR DB.** Áp `id_map`: `kg_nodes.node_key`→KC, `questions.node_key`→KC & `question_key`→Q-, `kg_edges`→E-, `resources`→R-, `socratic_ladders`→L-. **REMAP DỮ LIỆU HỌC SINH** (attempts/mastery_evidence/learning_sessions/session_turns/student_node_state trỏ theo key cũ → key mới) — TRONG 1 transaction. Verify: tiến độ học sinh còn nguyên.

**P4 — Tutor sửa CODE app** (bên tutor) để đọc key mới. Verify LIVE (học sinh làm bài, tiến độ, render).

**P5 — Nghiệm thu đầu-cuối** (sync Studio→tutor chạy theo KC/Q; học sinh cũ mở lại thấy đủ mastery). Xong → bỏ backup mapping.

## 4. Rủi ro lớn (phải xử, không né)
1. **Code Studio bám mã vị trí.** `chapInfo/cluInfo` suy Chương/Cụm TỪ mã. **XỬ LÝ (Hùng chốt 2026-07-23): GIỮ mã vị trí làm FIELD ẨN "sâu backend"** (vd `atom.viTri` = `TA10-C04-E01`) — KC là mã đại diện/hiển thị, mã vị trí không hiện ra UI nhưng logic nội bộ (`chapInfo/cluInfo`, tra cứu) vẫn dùng được → **KHÔNG phải refactor lớn**, chỉ ẩn khỏi giao diện + đổi `id` sang KC.
2. **Dữ liệu học sinh THẬT** (P3) — remap sai = mất tiến độ. Bắt buộc transaction + đối chiếu số dòng trước/sau + rollback sẵn sàng.
3. **Tutor vừa xây trên mã atom** (họ coi là "bất biến"). Re-key = đổi thứ họ vừa bàn giao. May: engine họ agnostic theo khoá → chỉ đổi GIÁ TRỊ + join, không viết lại. Phải phối hợp đúng nhịp P3↔P4.
4. **KC random trùng**: không gian 10^7, 12.907 atom → xác suất thấp nhưng vẫn **dedupe** khi sinh.

## 4b. TÍN HIỆU THỨ TỰ BÀI (tutor bắt lỗi 2026-07-23 — BẮT BUỘC)
`learning-path` của tutor xếp bài bằng topo-sort `prerequisite_hard`; khi không quyết định được thì **tiebreak bằng `node_key`**. `node_key` cũ = mã vị trí đệm-0 → ra đúng thứ tự chương/bài. KC ngẫu nhiên làm **MẤT tín hiệu này** → lộ trình xáo (Toán10: 259 cạnh/204 node, không phủ kín → ảnh hưởng thật). Không dùng được cột `chapter` (nhãn La Mã "Chương IX" so chuỗi sai).
**XỬ LÝ (chốt): mở rộng `kc_registry` đủ 12.907 atom** — mỗi dòng `(node_key=KC, vi_tri_trong_ct=mã vị trí đệm-0)` → tutor **tiebreak theo `vi_tri_trong_ct`** (~10 dòng sửa, làm trong P4). Trùng với quyết định "giữ mã vị trí sâu backend" (rủi ro #1). Studio đảm bảo vi_tri đệm-0 chuẩn.

## 5. Nhịp phối hợp Studio ↔ Tutor
- Studio làm P1→P2, đưa `id_map` + **hợp đồng re-key** (file riêng) cho tutor.
- Tutor chuẩn bị code đọc key mới (P4) SONG SONG.
- P3 (đổi tutor DB) + P4 (đổi code tutor) phải **đồng bộ một cửa sổ bảo trì** (maintenance window) để học sinh không gặp DB-mới-code-cũ.
- Bundle GDKTPL 10 + rubric riêng + câu nghe (Studio đang nợ tutor) → cấp **theo ID mới**, sau P2.
