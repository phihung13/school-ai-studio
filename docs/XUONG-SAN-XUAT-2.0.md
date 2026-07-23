# Xưởng sản xuất 2.0 — Phương án tích hợp harness cho từng định dạng
*(Bản đề xuất chờ duyệt — 2026-07-09. Chưa code.)*

## Vấn đề hiện tại
`src/lib/ai.ts` sinh mọi định dạng bằng **prompt trần** → model tự bịa cấu trúc, không có template, không validate, không kiểm sau khi render. Kết quả: slide/worksheet/quiz… "chưa cái nào ok". Đẹp không đến từ model — đẹp đến từ **engine render tất định**; model chỉ được phép điền chất liệu.

## Kiến trúc chung: 3 tầng + 2 loại worker
```
[1] CONTENT  — AI sinh JSON theo SCHEMA CHẶT (zod validate; sai → retry kèm lỗi)
       ↓            nguyên liệu lấy từ DB thật: atom (label/yeuCau/bloom/DOK) + edges (quan_niem_sai, remediation)
[2] RENDER   — engine tất định per format (template thương hiệu Việt Anh: brand green/brass từ globals.css)
       ↓
[3] QC       — checker per format (tràn chữ, thiếu trường, lỗi LaTeX, độ dài audio) → render lại nếu fail
       ↓
   Asset lưu vào /batch như hiện tại (Job model + activeRunner ĐÃ CÓ — chỉ thêm loại worker + artifact path)
```
- **Worker in-process (Node)** — nhanh, không cài thêm: markmap, mind-elixir, ts-fsrs, docxtemplater, pptxgenjs (đã có), docx (đã có).
- **Worker out-of-process** (spawn process, queue nền): ppt-master (agent), Typst (binary), genanki + edge-tts (Python), ffmpeg.

## Per định dạng (đã xác minh sống 2026-07-09, xem bảng cuối)

### 1. SLIDE — `hugohe3/ppt-master` (⭐37.8k, MIT) — THEO CHỈ ĐỊNH
- **Bản chất**: không phải thư viện mà là **skill chạy bằng agent** (Claude Code/Cursor): tài liệu vào → chốt design spec → thiết kế từng slide bằng SVG → script Python xuất **PPTX native shapes** (mọi phần tử chỉnh được trong PowerPoint) + transition + speaker notes (đọc được thành thuyết minh). Hỗ trợ **template-fill**: đổ nội dung vào file .pptx mẫu của trường.
- **Tích hợp vào studio**: thêm worker "slide-agent": khi Job slide chạy → server spawn **Claude Code headless** (`claude -p`, hoặc Agent SDK) trong thư mục ppt-master, input = gói nội dung của nguyên tử/chương (từ DB) + template .pptx Việt Anh; output .pptx thu về `data/assets/`. Chạy nền vài phút/deck → hợp mô hình Job hiện có.
- **Yêu cầu**: Python 3.10+, ANTHROPIC_API_KEY (đã có trong app), model mạnh (tác giả khuyến nghị Opus; "harness + model = agent" — model quyết định trần chất lượng). Tùy chọn ảnh AI (`IMAGE_BACKEND`) hoặc ảnh stock (Pexels/Pixabay key miễn phí).
- **Việc một lần**: làm 1 file .pptx template thương hiệu Việt Anh (màu brand, font, logo) cho workflow template-fill + 2–3 design spec chuẩn (bài giảng / ôn tập / phụ huynh).

### 2. WORKSHEET / ĐỀ / PHIẾU — `typst/typst` (⭐54.8k, Apache-2.0) + `docxtemplater` (core MIT)
- **PDF đẹp (in)**: viết 3 template `.typ` (phiếu bài tập, đề kiểm tra, phiếu ôn theo lỗ hổng) có sẵn khung brand + hỗ trợ công thức toán; AI chỉ sinh JSON `{đề bài[], mức độ, đáp án[], lời giải[]}` → đổ vào template → `typst compile` ra PDF <1 giây. Binary duy nhất, không dependency.
- **DOCX (giáo viên sửa được)**: template Word có placeholder `{ten_bai} {cau_hoi}` do chính giáo viên chỉnh bằng Word → docxtemplater đổ JSON vào. (Nếu ngại license module phụ: thay bằng thư viện `docx` npm đã có sẵn trong app.)
- **Điểm ăn tiền**: phần "phiếu ôn theo lỗ hổng" lấy thẳng `quan_niem_sai` + `remediation_hint` từ edges trong DB — thứ không AI nào bịa được.

### 3. QUIZ — schema nội bộ (khớp Trạm 3) + xuất GIFT/Moodle + `h5p-standalone` (⭐339, MIT)
- Schema câu hỏi **dùng luôn chuẩn Trạm 3 của kho** (DOK + độ khó + distractor gắn quan niệm sai) — kho đã có skill sinh & thẩm định câu hỏi, app chỉ cần cùng schema.
- 3 ngả render từ CÙNG một JSON: (a) **web tương tác** trong app (component tự viết, chấm điểm ngay); (b) **GIFT/Moodle XML** export cho LMS; (c) **bản in** qua template Typst ở mục 2.
- H5P để dành khi cần dạng tương tác phức tạp (kéo-thả, điền chỗ trống) — AI sinh `content.json` theo schema H5P, nhúng bằng h5p-standalone.

### 4. MINDMAP — `markmap` (⭐12.9k, MIT) + `mind-elixir` (⭐3.1k, MIT)
- **Không cần AI sinh cấu trúc** — dựng thẳng từ cây THẬT trong DB (Môn→Chương→Điểm KT→nguyên tử); AI chỉ viết nhãn tóm tắt ngắn nếu label dài.
- markmap: markdown → mindmap SVG tương tác (xem, zoom, thu gọn nhánh) — nhúng vào trang nguyên tử/chương.
- mind-elixir: bản **chỉnh sửa được** cho giáo viên (JSON in/out) → lưu lại làm asset.

### 5. FLASHCARD — `ts-fsrs` (⭐705, MIT) + `genanki` (⭐2.6k, MIT)
- Thẻ sinh từ atom: mặt trước = câu hỏi/label, mặt sau = `yeu_cau_can_dat` + ví dụ từ gói nội dung; thẻ "bẫy" sinh từ `quan_niem_sai`.
- **Học ngay trong app** (/tutor): lịch ôn FSRS bằng ts-fsrs — khớp định hướng AI tutor + tiến độ học sinh (mục tồn của runbook).
- **Export .apkg** cho học sinh dùng Anki: worker Python genanki.

### 6. PODCAST — pattern `podcastfy` (⭐6.4k, Apache-2.0) + `edge-tts` (⭐11.5k, GPL-3)
- Không cần bê nguyên podcastfy — **bê kiến trúc**: AI sinh **kịch bản hội thoại JSON** 2 vai (Cô giáo + học sinh tò mò, có timestamps, chèn nhấn mạnh quan niệm sai thường gặp) → validate → TTS từng lượt thoại → ffmpeg ghép + nhạc hiệu.
- Giọng Việt: edge-tts **miễn phí** với `vi-VN-HoaiMyNeural` (nữ) + `vi-VN-NamMinhNeural` (nam). GPL-3 → gọi qua process riêng (dùng nội bộ, không phân phối — sạch). Nâng cấp sau: FPT.AI/Zalo TTS (trả phí, tự nhiên hơn) chỉ là đổi 1 adapter.

### 7. TEXT — giữ markdown hiện tại + thêm nút "bản in đẹp" qua template Typst.

### (Video — GÁC LẠI theo quyết định 2026-07-09.)

## Hạ tầng cần thêm (một lần)
1. `workers/` — Python venv (ppt-master, genanki, edge-tts) + Typst binary + ffmpeg; healthcheck lúc khởi động.
2. `src/lib/schemas/` — zod schema per format + vòng validate-retry quanh call AI (thay prompt trần trong ai.ts).
3. `src/lib/templates/` — template Typst/Word/pptx thương hiệu (1 buổi làm với thiết kế).
4. Nâng Job model: `workerType`, `artifacts[]`, timeout, log stream (Job/activeRunner đã có sẵn, sửa nhỏ).
5. QC checkers per format (text overflow, JSON đủ trường, audio dài bất thường…).

## Lộ trình đề xuất (duyệt xong mới code)
- **P1 (nhanh, thuần Node, dùng data thật)**: Quiz + Mindmap + Flashcard-trong-app.
- **P2**: Worksheet Typst (PDF) + DOCX template.
- **P3 (nặng nhất)**: Slide ppt-master (dựng worker agent + template trường + design spec).
- **P4**: Podcast (kịch bản + edge-tts + ffmpeg) + export .apkg.

## Xác minh repo (GitHub API, 2026-07-09)
| Repo | ⭐ | Push cuối | License |
|---|---|---|---|
| hugohe3/ppt-master | 37.877 | 2026-07-08 | MIT |
| typst/typst | 54.811 | 2026-07-07 | Apache-2.0 |
| presenton/presenton *(tham khảo)* | 8.977 | 2026-07-09 | Apache-2.0 |
| icip-cas/PPTAgent *(tham khảo)* | 4.788 | 2026-06-29 | MIT |
| markmap/markmap | 12.932 | 2026-06-21 | MIT |
| ssshooter/mind-elixir-core | 3.081 | 2026-07-08 | MIT |
| edge-tts | 11.460 | 2026-03-22 | GPL-3 (chạy process riêng) |
| podcastfy | 6.431 | 2026-05-04 | Apache-2.0 |
| docxtemplater | 3.602 | 2026-06-18 | core MIT / module trả phí |
| ts-fsrs | 705 | 2026-07-08 | MIT |
| genanki | 2.644 | 2024-12-30 | MIT (ổn định, ít cần update) |
| h5p-standalone | 339 | 2026-03-24 | MIT |
