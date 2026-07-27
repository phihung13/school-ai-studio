# KaTeX 67 câu — ĐÃ VÁ XONG, mời Tutor re-import

**Ngày:** 2026-07-27 · **Nguồn việc:** bàn giao đội Tutor 25/07 (`docs/katex-fixlist.csv` — 118 lỗi parse / 67 câu `Q-…`).

## 1. Kết luận điều tra (giữ nguyên, để hai bên không hiểu nhầm lần sau)

Chạy CHÍNH pipeline render của Studio (`splitMath` + `normalizeTex` + KaTeX `throwOnError`) trên cả 67 câu → **0/67 hỏng**.
Nên câu "Studio soạn sai nguồn" là **không đúng**; bản bàn giao ghi "cổng dùng chính logic app, mirror 1-1 parity" cũng không đúng. Hai chỗ lệch thật giữa renderer hai bên:

| # | Lệch | Studio | Tutor |
|---|------|--------|-------|
| a | Blank `____` (`_{2,}` → `\underline`) | có luật trong `mathrender.ts / normalizeTex` | **thiếu** → vỡ |
| b | Văn xuôi Unicode (`∈ ℕ ² θ̄`, `\` hiệu tập, ngoặc `{}`) | chỉ render đoạn CÓ delimiter | **ép mathify** cả văn xuôi không bọc `$` → vỡ |

Phân loại 67 câu: 21 câu có `\(…\)` thật (lỗi blank), 46 câu văn xuôi thuần.

## 2. Studio đã làm gì (Hùng chốt: Studio ôm hết, chuẩn hoá nguồn độc lập)

Vá **surgical** — KHÔNG LaTeX-hoá toàn bộ văn xuôi, chỉ trung hoà 5 thủ phạm:

1. Ngoặc `{…}` → bọc RIÊNG ngoặc `{`→`$\{$`, `}`→`$\}$` (ruột giữ nguyên văn xuôi; tránh `\text{}` vì KaTeX text-font thiếu chữ Việt → tofu).
2. Hiệu tập `A\B` → `$A\setminus B$`.
3. Blank `____` dính `^`/`{}` → `\underline{\hphantom{00}}`.
4. Macron `θ̄`/`X̄` (U+0304) → `$\bar{…}$`.
5. Nháy thẳng `'` sau mũ (thành prime → "double superscript") → nháy cong `‘…’`.

**Kết quả:** 87 trường / 67 câu · **0 lỗi KaTeX-strict** (validate lại trên dữ liệu SỐNG sau khi ghi: 278 trường, 0 lỗi).

## 3. Đã ghi ở đâu (3 nơi, đều verify)

| Nơi | Trạng thái |
|-----|-----------|
| `studio_kv` (Supabase `jhqdzrejpcvasbsnamer`, nguồn boot của app Studio) | ✅ 67 câu / 87 trường |
| Bảng `questions` (KG store — Tutor đọc) | ✅ 67 câu PATCH, 0 lỗi |
| `data/studio.db` (bản làm việc trên máy dev) | ✅ 67 câu (khớp, tránh kv-sync đẩy ngược bản cũ) |

Script durable: `scripts/fix-katex-questions.mjs` — `(không cờ)` dry-run · `--write-db` · `--write-kv` · `--write-questions`, đều cần thêm `--yes` mới ghi thật, và **dừng ngay nếu còn field hỏng**. Transform idempotent (chạy lại 0 trường đổi).

## 4. Việc của đội Tutor

1. **Re-export/re-import**: `convert-studio-questions.ts` đọc file JSON Studio xuất (`--in=`) → xuất lại từ Studio rồi import; 67 câu sẽ qua cổng và tự lên `active`.
2. **Nên vá thêm ở renderer Tutor** (để lần sau không phát sinh lại cùng loại lỗi):
   - thêm luật blank `_{2,}` → `\underline{\hphantom{00}}` như Studio;
   - **bỏ ép mathify văn xuôi**: chỉ render đoạn nằm trong delimiter `$…$` / `\(…\)` / `\[…\]`, phần còn lại để nguyên text.
   Không có 2 điểm này thì mọi câu văn xuôi có ký tự toán Unicode đều còn nguy cơ kẹt `review`.
