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
- ⏳ **P3 — Tutor CHỜ**: đổi DB tutor + remap dữ liệu học sinh. **Blocker = đội tutor** (phải deploy code P4 + chốt cửa sổ bảo trì), KHÔNG phải chờ Hùng duyệt.

---

## 3. BƯỚC TIẾP THEO (làm gì tiếp)
**3a. Hùng đưa tutor file** `docs/TUTOR-P3P4-cua-so-bao-tri.md`, lấy về 3 câu trả lời:
1. `question_key` của tutor có dùng ở đường phục vụ/chấm bài, hay chỉ import?
2. Còn cột/logic ẩn nào (trong edge function tutor) trỏ node/câu bằng mã vị trí?
3. Lịch **cửa sổ bảo trì** + xác nhận code P4 sẵn deploy trong cửa sổ.

**3b. Sau khi tutor trả lời → Studio (Claude) làm:**
- Dựng **script remap tutor** (dùng `id_map.frozen.json` + service key REST hoặc Supabase MCP execute_sql, CHỈ project `gxbxsdhvtwtjkfygetzb`). Bề mặt remap (17 cột text, đã soi schema thật):
  - **node_key→KC**: `kg_nodes.node_key`, `kg_edges.from_key/to_key`, `kg_tiers.node_key`, `questions.node_key`, `resources.node_key`, `socratic_ladders.node_key`, + học sinh: `attempts.node_id`, `mastery_evidence.node_id`, `learning_sessions.current_node_id`, `student_node_state.node_id`, `xp_events.node_id`.
  - **question_key→Q-**: CHỈ `questions.question_key`.
  - **id riêng→E-/R-/L-**: `kg_edges`/`resources`/`socratic_ladders` (nếu cột id là text).
  - **`kc_registry` dựng lại đủ 12.907**: `node_key`=KC, `vi_tri_trong_ct`=**rank đệm-0** (thứ tự bài toàn cục — để tutor tiebreak lộ trình).
  - 🎯 **Dữ liệu học sinh AN TOÀN**: `attempts/mastery/submissions.question_id` = **UUID `questions.id`** (bất biến) → KHÔNG remap. Anti-join mọi cột node = **0 mồ côi** → remap sạch.
- Chạy trong **1 transaction**, đối chiếu số dòng trước=sau, rollback sẵn. Đồng bộ P3(đổi DB)↔P4(tutor deploy code) trong CÙNG cửa sổ.
- Đẩy `id_map` lên Supabase dùng chung (`public.id_map`) nếu cần lưu bền.

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
