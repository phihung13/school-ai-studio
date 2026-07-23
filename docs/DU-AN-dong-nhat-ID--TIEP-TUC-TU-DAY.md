# DỰ ÁN ĐỒNG NHẤT ID — BÀN GIAO ĐỂ TIẾP TỤC (bất kỳ acc/session nào)

> **Đọc file này là nối lại được dự án ngay tại điểm đang dừng.** Cập nhật lần cuối: **2026-07-23**.
> Người phụ trách: Hùng (dân kỹ thuật, không rành giáo trình — trả lời thẳng, không vòng vo).

---

## 1. Dự án là gì
Hệ sinh thái **Trường Việt Anh**:
- **Studio "Học liệu Việt Anh"** (`D:\school ai\studio`, Next.js 16.2.10, SQLite `data/studio.db`) — app biên soạn học liệu theo cây nguyên tử.
- **App Tutor** (học sinh học/luyện) — chạy trên **Supabase dùng chung** `gxbxsdhvtwtjkfygetzb` ("app sản xuất").
- 🚫 **CẤM TUYỆT ĐỐI** đụng Supabase `eagsageokobtidpmxucx` ("viet-anh-class") — app khác hệ.

**Mục tiêu dự án này:** đổi TOÀN BỘ ID (cả 2 app) sang chuẩn bất biến vô nghĩa, bỏ khoá theo "mã vị trí" (`TA10-C04-E01`) vì mã vị trí đổi mỗi lần tái phân rã chương trình.

| Thực thể | ID mới | Cách sinh |
|---|---|---|
| Node/nguyên tử | `KC-` + 7 số | NGẪU NHIÊN không trùng (giữ KC đã có trong `kc_registry`) |
| Câu hỏi | `Q-` + 7 số | TUẦN TỰ 1→n, môn→lớp→chương→bài |
| Cạnh | `E-` + 7 số | TUẦN TỰ |
| Học liệu | `R-` + 7 số | TUẦN TỰ |
| Thang Socratic | `L-` + 7 số | TUẦN TỰ (tutor-only) |

**Chốt thiết kế:** `atom.id → KC`, nhưng **`atom.code` GIỮ = mã vị trí** (dùng display + suy chương/cụm khi import; app resolve mọi thứ qua `id` nên KC trong suốt). Studio là **bên sinh ID** (authority). Q/E/R sinh tuần tự qua `settings.idSeq`.

---

## 2. TRẠNG THÁI (đang ở đâu)
- ✅ **P1 — id_map ĐÓNG BĂNG**: `data/migration/id_map.frozen.json`. Quy mô: **12.910 KC · 9.626 Q- · 8.911 E- · 61 R- · 2.630 L-**. KC ngẫu nhiên → **KHÔNG chạy lại builder** (ra KC khác, hỏng ánh xạ). Đã audit sạch, xác nhận dựng từ đúng data sống.
- ✅ **P2 — Studio ĐÃ CUTOVER LIVE** (23/07): `studio.db` = bản migrated, `npm run build` + `next start -p 3200`, nghiệm thu OK (graph 12.907 nt/8.910 lk, atom `/atom/KC-3566611` resolve KC, các route 200).
- ✅ **Tutor đã ĐỒNG Ý re-key** (đối ứng vòng 1, 23/07) — audit code xác nhận engine agnostic theo khoá, chỉ có `learning-path.tiebreak` phụ thuộc tính-thứ-tự của `node_key` (đã sửa ~10 dòng, CHƯA deploy). Phát hiện quan trọng: **`kg_nodes` tutor hiện CHỈ có 2 môn sống** — Toán (417 node) + Anh (341 node) = 758 node, KHÔNG phải cả 12 môn — phạm vi P3 thực tế nhỏ hơn nhiều so với 12.907.
- ✅ **`kc_registry` đã bổ sung đủ cho 758 node đang sống** (23/07): thêm 554 dòng (Tiếng Anh 10 + Toán 9 còn thiếu + 3 seed tutor-only), dọn 3 dòng rác → tổng 3.417 dòng.
- ✅ **P4 tutor đã deploy sớm** (`learning-path` v10, tiebreak theo `kc_registry.vi_tri_trong_ct`, fallback `node_key` an toàn khi chưa remap — đã đọc thẳng source code xác nhận đúng thiết kế) — deploy trước P3 không đổi hành vi (nhánh fallback), tự kích hoạt logic mới ngay khi P3 chạy xong.
- ✅ **P3 ĐÃ CHẠY XONG VÀ VERIFY SẠCH (23/07, Hùng duyệt "không cần cửa sổ bảo trì, chạy luôn").** Remap phạm vi Toán+Anh (758 node sống): `kg_nodes.node_key`, `kg_edges.from_key/to_key`, `questions.node_key`+`question_key` (2.967 câu), `resources.node_key`, `socratic_ladders.node_key`, + 5 cột học sinh (`attempts/mastery_evidence/learning_sessions/student_node_state/xp_events`) — toàn bộ qua UPDATE...FROM kc_registry (JOIN theo code cũ, không cần data literal, gọn) + 5 batch VALUES cho question_key (kiểm chứng trước: 2967/2967 khớp tuyệt đối với id_map, 0 lệch). **Verify sau chạy:** số dòng mọi bảng trước=sau khớp 100% (kg_nodes 758, kg_edges 586, questions 2967, attempts 60, mastery_evidence 50, learning_sessions 33, student_node_state 9, xp_events 6, session_turns 129 — không mất dòng nào); quét regex 12 cột liên quan = **0 key định dạng cũ còn sót**; sample end-to-end (`TO10-C01-A01`→`KC-3566611`, 7 câu hỏi + 6 cạnh resolve đúng) và dữ liệu mastery_score học sinh thật vẫn nguyên, join đúng qua node_key mới.
- 🎉 **P3/P4 — TUTOR NGHIỆM THU ĐẠT (23/07).** Tutor verify độc lập trên DB prod + gọi `learning-path` thật: 544 node active + 2.967 câu toàn KC-/Q- (0 key cũ ở 9 cột khoá), 0 mất dòng, attempts/mastery 0 mồ côi (tiến độ HS nguyên), 204+340 node có `vi_tri_trong_ct`, **thứ tự lộ trình đúng** (Anh khớp 100%; Toán đúng — A07 nổi trước A06 là "mở khoá thông minh" available/locked, không phải xáo do key). Studio tự xác minh lại 24/07: 0 node_bad/q_bad/mồ côi — khớp. **CẢ 2 BÊN KÝ. Dự án đồng nhất ID = P1–P4 XONG TRỌN.**
- ⏳ **CÒN NỢ (Studio giao theo ID mới — KHÔNG thuộc migration nữa, additive, không cần cửa sổ):** bundle **GDKTPL 10** (210 câu), **rubric ~340** câu tự luận (3 khuôn kỹ năng Viết/Nói/Lập luận, jsonb thang_muc 0–3), câu **`nghe`** + transcript, và **socratic_ladders/rubric Tiếng Anh** (đang gần trống — tutor báo 0, thực 1 dòng seed).

---

## 3. BƯỚC TIẾP THEO (làm gì tiếp)
**3a. Chờ tutor trả lời `docs/DOI-UNG-TUTOR-P3P4-vong2.md`** (gửi 23/07): chốt ngày giờ cụ thể cửa sổ bảo trì (đề xuất ngoài giờ học, khoá login 30–60'; vì phạm vi thực tế chỉ 758 node nên cửa sổ có thể ngắn hơn dự tính ban đầu).

**3b. Sau khi có lịch → Studio (Claude) làm:**
- Dựng **script remap tutor CHÍNH THỨC** (dùng `id_map.frozen.json`, CHỈ project `gxbxsdhvtwtjkfygetzb`, phạm vi thực tế = node/câu/cạnh thuộc 2 môn Toán+Anh đang sống, không phải toàn bộ 12.907). Bề mặt remap (đã soi schema thật):
  - **node_key→KC**: `kg_nodes.node_key`, `kg_edges.from_key/to_key`, `kg_tiers.node_key`, `questions.node_key`, `resources.node_key`, `socratic_ladders.node_key`, + học sinh: `attempts.node_id`, `mastery_evidence.node_id`, `learning_sessions.current_node_id`, `student_node_state.node_id`, `xp_events.node_id`.
  - **question_key→Q-**: CHỈ `questions.question_key` (xác nhận an toàn tuyệt đối — không dùng ở serving, chỉ import + `teacher-stats.order` cosmetic).
  - **id riêng→E-/R-/L-**: `kg_edges`/`resources`/`socratic_ladders` (nếu cột id là text).
  - 🎯 **Dữ liệu học sinh AN TOÀN**: `attempts/mastery/submissions.question_id` = **UUID `questions.id`** (bất biến) → KHÔNG remap. Anti-join mọi cột node = **0 mồ côi** → remap sạch.
- Chạy trong **1 transaction**, đối chiếu số dòng trước=sau, rollback sẵn. Đồng bộ P3(đổi DB)↔P4(tutor deploy `learning-path` mới) trong CÙNG cửa sổ.
- Khi tutor mở thêm môn mới → bổ sung `kc_registry` cho môn đó trước (cùng cách đã làm, additive, không cần cửa sổ riêng).

**3c. Studio còn nợ tutor (giao theo ID mới, sau re-key):** bundle **GDKTPL 10** (210 câu), **rubric từng câu tự luận** (~340), câu **`nghe`** kèm transcript.

---

## 4. TẠI SAO P3 KHÔNG chạy đơn phương được
Tutor `learning-path` topo-sort tiebreak bằng `node_key` (mã vị trí đệm-0 → đúng thứ tự bài). Đổi `node_key`→KC ngẫu nhiên mà tutor chưa chuyển tiebreak sang `kc_registry.vi_tri_trong_ct` (P4) → **lộ trình học sinh loạn ngay**. Đây là dependency kỹ thuật, không phải chuyện quyền duyệt.

---

## 5. FILE & ĐƯỜNG DẪN QUAN TRỌNG
- `docs/MIGRATION-ID-dong-nhat.md` — kế hoạch P0–P5.
- `docs/TUTOR-P3P4-cua-so-bao-tri.md` — **file đưa tutor** (P4 + 3 câu hỏi + lịch).
- `docs/HOP-DONG-TUTOR-rekey-ID.md` — hợp đồng re-key bản đầu.
- `data/migration/id_map.frozen.json` — **ánh xạ ĐÓNG BĂNG (nguồn sự thật cho P3)**.
- `data/migration/CUTOVER-P2.md` — quy trình cutover Studio (ĐÃ chạy) + lệnh rollback.
- `data/migration/studio.pre-P2.db`, `studio.rollback.db`, `live-backup-P2/` — backup rollback Studio.
- Code đã sửa P2 (5 file): `src/lib/ids.ts` (mới), `src/lib/shared.ts` (Question.key, Settings.idSeq), `src/lib/import-kb.ts` (tra atom theo code→KC, sinh KC/Q-/E-, idempotent), `src/app/api/action/route.ts` (atom→newKC, asset→newR), `src/lib/tutor-push.ts` (node_id=atom.id), `src/lib/store.ts` (env `STUDIO_DB`).

---

## 6. HẠ TẦNG & AN TOÀN (đọc kỹ trước khi thao tác)
- **Studio chạy** `next start -p 3200` (KHÔNG phải :3000). Build: `npm run build`. Login `qt.hung`/`vietanh2026`. launch.json ở `studio/.claude` (studio=3101, dev=3102).
- **ĐỪNG mở `studio.db` bằng node lúc server chạy** kiểu xung đột → trôi data. Muốn đọc state sống phải **gộp cả `-wal`** (studio.db có WAL chưa checkpoint; `cp studio.db` không có `-wal` = ra state cũ).
- **Supabase**: CHỈ `gxbxsdhvtwtjkfygetzb`. 🚫 CẤM `eagsageokobtidpmxucx` (viet-anh-class) — không đọc/ghi/query. Trên máy còn process E:\Viet-Anh-class chạy (PID cao) — KHÔNG dừng.
- **Service key** Supabase (service_role của gxbxs): Hùng đã dùng trong session (script REST bỏ RLS); Hùng bảo **BỎ QUA việc rotate — đừng nhắc lại**. KHÔNG lưu key thô vào doc/repo.
- **Rào an toàn Claude**: classifier CHẶN Claude ghi đè DB production / khởi process production → **cần Hùng duyệt trong chat từng lần** (P2 cutover đã duyệt & chạy xong; P3 đụng DB học sinh cũng sẽ cần duyệt).

---

## 7. CÁCH TIẾP TỤC Ở SESSION/ACC MỚI
Mở Claude Code trong `D:\school ai` (hoặc `D:\school ai\studio`), bảo Claude: *"Đọc `studio/docs/DU-AN-dong-nhat-ID--TIEP-TUC-TU-DAY.md` rồi tiếp tục dự án đồng nhất ID."* — file này + các file mục 5 là đủ để nối lại. Nếu tutor đã trả lời 3 câu ở mục 3a → đưa câu trả lời + lịch cửa sổ để dựng script remap P3.
