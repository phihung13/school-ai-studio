# CUTOVER P2 — Áp ID mới vào Studio LIVE

**✅ ĐÃ CHẠY XONG 23/07 (Hùng duyệt).** studio.db = bản migrated, `npm run build` (17 route OK), `next start -p 3200`. Nghiệm thu: /graph 12.907 nt·8.910 lk 12 môn, atom /atom/KC-3566611 resolve KC OK, các route 200. Giữ file này làm bản ghi + lệnh rollback bên dưới. *(Các bước dưới là quy trình đã dùng — chạy lại chỉ khi cần làm lại/rollback.)*

## Đã sẵn (đã kiểm)
- `data/migration/id_map.frozen.json` — bảng ánh xạ ĐÓNG BĂNG (KC ngẫu nhiên; chạy lại builder sẽ ra KC khác → KHÔNG chạy lại).
- `<scratchpad>/studio.migrated.db` — studio.db đã di trú, tự nghiệm thu SẠCH + re-import idempotent (0 trùng).
- Code đã sửa (5 file, `tsc --noEmit` EXIT=0): `src/lib/ids.ts` (mới), `shared.ts` (Question.key, Settings.idSeq), `import-kb.ts` (tra atom theo code→KC, sinh KC/Q-/E-), `action/route.ts` (atom→KC, asset→R-), `tutor-push.ts` (node_id=atom.id), `store.ts` (env STUDIO_DB).
- Backup rollback: `data/migration/studio.pre-P2.db` và `data/migration/live-backup-P2/` (studio.db+wal+shm gốc).

## Các bước cutover (chạy trong thư mục `D:\school ai\studio`)
```powershell
# 1. Dừng server Studio (KHÔNG đụng process E:\Viet-Anh-class!)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'school ai\\studio' -and $_.CommandLine -match 'start' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 2. Backup nóng + swap DB
Copy-Item data\studio.db data\migration\studio.rollback.db -Force
Copy-Item "<scratchpad>\studio.migrated.db" data\studio.db -Force
Remove-Item data\studio.db-wal,data\studio.db-shm -ErrorAction SilentlyContinue

# 3. Build lại (đưa code KC vào bản production) + chạy lại
npm run build
npm run start -- -p 3200
```
*(thay `<scratchpad>` = `C:\Users\ASUS\AppData\Local\Temp\claude\D--school-ai\40f86ae5-72a1-4654-94ad-035a271cd32a\scratchpad`)*

## Nghiệm thu sau cutover
- Mở `/curriculum`, `/graph`: cây + đồ thị hiển thị đúng, chip mã vẫn hiện mã vị trí (code giữ).
- Mở 1 atom: học liệu/gói/câu load đúng (resolve theo id=KC).
- Import thử (dry-run) 1 file kho cũ: **0 câu/atom/cạnh MỚI** (idempotent) — nếu ra "mới" là hỏng, rollback.

## Rollback (nếu hỏng)
```powershell
Copy-Item data\migration\live-backup-P2\studio.db data\studio.db -Force
Copy-Item data\migration\live-backup-P2\studio.db-wal data\studio.db-wal -Force
Copy-Item data\migration\live-backup-P2\studio.db-shm data\studio.db-shm -Force
npm run build; npm run start -- -p 3200   # (code cũ tương thích cả DB cũ vì import tra theo code)
```

## Thiết kế đã chốt khi làm P2
- **atom.id → KC**, **atom.code GIỮ = mã vị trí** (TA10-C04-E01) cho display + suy chương/cụm khi import. App resolve toàn bộ qua `id` nên đổi id+tham chiếu đồng thời là trong suốt. → KHÁC kế hoạch cũ ("ẩn mã vị trí khỏi UI"): tôi GIỮ hiện mã vị trí vì hữu ích cho giáo viên + đảo ngược dễ (đổi `.code`→`.id` ở ~7 chỗ display nếu muốn ẩn).
- Q-/E-/R- tuần tự qua `settings.idSeq` (Studio là bên sinh ID). `question.key` giữ mã câu cũ để re-import khớp.

## CÒN LẠI (không thuộc P2)
- P3 tutor (đổi DB + remap dữ liệu học sinh) — cửa sổ bảo trì, Hùng hẹn lịch với tutor.
- Đẩy `id_map` lên Supabase dùng chung `public.id_map` + mở rộng `kc_registry` đủ 12.907 (tiebreak).
- Gửi tutor hợp đồng re-key + bundle GDKTPL/rubric/nghe theo ID mới (sau P2).
