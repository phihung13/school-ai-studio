# Triển khai Studio lên VPS (CI/CD qua GitHub → GHCR → VPS)

> ⚠️ **Bản này mô tả luồng CŨ** (`docker compose pull` + scp DB lên VPS). Kiến trúc đang chạy thật giờ là
> **Coolify + Supabase-stateless** (không scp DB, VPS kéo DB từ Supabase lúc boot). Xem **[docs/DEPLOY-PLAYBOOK.md](docs/DEPLOY-PLAYBOOK.md)**
> để có quy trình hiện hành + tối ưu tốc độ. Giữ file này làm tham chiếu biến thể compose thuần.

Luồng: **push code lên GitHub → GitHub Actions build Docker image → đẩy lên GHCR → VPS kéo image về chạy.**
DB (`data/studio.db`) nằm ở volume trên VPS, **không** nằm trong image → update code không đụng tới dữ liệu.

```
  máy bạn ──git push──▶ GitHub ──Actions build──▶ ghcr.io/<owner>/<repo>:latest
                                                         │
                                          VPS: docker compose pull && up -d
                                                         │
                                   http://<VPS_IP>:3000   (DB ở ./data trên VPS)
```

File đã tạo sẵn trong repo: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `.github/workflows/deploy.yml`.

---

## 0. Có sẵn gì trong image
Image cài đủ để chạy **mọi** tính năng xuất bản:
- **Node 24** (đủ mới để dùng `node:sqlite` không cần cờ) + toàn bộ app Next 16.
- **chromium** → xuất slide PPTX/PDF (marp). **ffmpeg** → hậu kỳ podcast. **typst** → worksheet/bài đọc PDF. **python + edge-tts** → giọng đọc tiếng Việt.
- Font Latin/emoji cho tiếng Việt.
> Lưu ý nhỏ: worksheet gọi font *Times New Roman* (không có sẵn trên Linux) → typst tự thay bằng serif tương đương. Muốn giống hệt thì cài `ttf-mscorefonts-installer` hoặc đổi font trong `src/lib/templates`.

---

## 1. Đưa code lên GitHub (làm 1 lần)
Repo git đã có sẵn (nhánh `master`), **chưa** có remote. Tạo repo mới trên GitHub (để **Private** cũng được), rồi:

```bash
cd "school ai/studio"        # đúng thư mục chứa package.json
git add Dockerfile .dockerignore docker-compose.yml .env.example DEPLOY.md .github
git commit -m "Thêm hạ tầng deploy (Docker + CI/CD)"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin master
```
> `.env` thật **không bao giờ** push (đã bị `.gitignore` chặn) — chỉ push `.env.example`.

Push xong, mở tab **Actions** trên GitHub → workflow `build-and-deploy` chạy, build và đẩy image lên GHCR.
Image sẽ ở: `ghcr.io/<owner>/<repo>:latest` (tên tự hạ chữ thường).

---

## 2. Chuẩn bị VPS (làm 1 lần)
Yêu cầu: Ubuntu/Debian, ≥ 2 GB RAM (chromium ngốn RAM), Docker + Docker Compose plugin.

```bash
# Cài Docker (nếu chưa)
curl -fsSL https://get.docker.com | sh

# Thư mục chạy app
mkdir -p ~/va-studio/data && cd ~/va-studio
```

Copy 2 file từ repo về VPS (đặt tại `~/va-studio/`):
- `docker-compose.yml`
- `.env`  ← tạo từ `.env.example`, điền thật (xem bước 3)

Nếu repo/GHCR để **Private**, đăng nhập GHCR trên VPS 1 lần (dùng Personal Access Token có quyền `read:packages`):
```bash
echo "<GHCR_PAT>" | docker login ghcr.io -u <owner> --password-stdin
```
> Để repo package **Public** thì bỏ qua bước login (trong GitHub: Packages → package → Package settings → Change visibility → Public).

---

## 3. Tạo `.env` trên VPS
```bash
cp .env.example .env && nano .env
```
Điền:
- `STUDIO_IMAGE=ghcr.io/<owner>/<repo>:latest`  ← **bắt buộc**, khớp repo của bạn
- `DEMO_PASSWORD=...`  ← đổi mật khẩu đăng nhập khác mặc định

> **Key AI KHÔNG đặt trong `.env`.** Sau khi app chạy, đăng nhập tài khoản quản trị → **Cài đặt → Kết nối OpenRouter (DeepSeek)** → dán key `sk-or-v1-…` → **Kiểm tra** → **Lưu**. Key lưu trong DB (`data/studio.db`) nên **sống qua mọi lần redeploy** (nằm ở volume `./data`).

---

## 4. ⚠ Nạp DB thật (BẮT BUỘC trước lần chạy đầu)
Image **không** chứa dữ liệu. Không nạp DB → app rỗng (mất toàn bộ atoms/câu hỏi).

Từ máy Windows đang có DB, copy 3 file (`.db` + `.db-wal` + `.db-shm` nếu có) lên VPS:
```bash
# chạy trên máy bạn (đường dẫn thật: school ai/studio/data/studio.db)
scp "data/studio.db"* <user>@<VPS_IP>:~/va-studio/data/
```
> Nên **tắt app studio ở máy local** trước khi copy để WAL gộp xong, DB nhất quán.

---

## 5. Chạy
```bash
cd ~/va-studio
docker compose pull      # kéo image từ GHCR
docker compose up -d     # chạy nền
docker compose logs -f   # xem log khởi động (Ctrl-C để thoát log)
```
Mở `http://<VPS_IP>:3000` → đăng nhập (vd `qt.hung` / mật khẩu `DEMO_PASSWORD`).
→ Vào **Cài đặt → Kết nối OpenRouter** dán key `sk-or-v1-…` để bật AI thật (xem mục 3).

---

## 6. Bật auto-deploy (tùy chọn — mỗi lần push tự cập nhật VPS)
Không bật thì mỗi lần muốn cập nhật, tự SSH vào VPS chạy `docker compose pull && docker compose up -d` (mục 7).

Bật tự động: trong repo GitHub → **Settings → Secrets and variables → Actions**:
- **Variables** → thêm `VPS_DEPLOY` = `true`
- **Secrets** → thêm:
  | Secret | Giá trị |
  |---|---|
  | `VPS_HOST` | IP/hostname VPS |
  | `VPS_USER` | user SSH (vd `root`) |
  | `VPS_SSH_KEY` | **private key** SSH (toàn bộ nội dung, gồm dòng BEGIN/END) |
  | `VPS_PATH` | đường dẫn app trên VPS, vd `/root/va-studio` |
  | `VPS_PORT` | *(tùy chọn)* cổng SSH nếu khác 22 |

Từ đó mỗi lần `git push` nhánh `master`/`main`: Actions build image mới rồi SSH vào VPS `pull` + `up -d`. DB an toàn (nằm ở `./data`).
> VPS vẫn cần đăng nhập GHCR (bước 2) nếu package Private.

---

## 7. Cập nhật thủ công / vận hành
```bash
# cập nhật khi có image mới
cd ~/va-studio && docker compose pull && docker compose up -d

# xem log / trạng thái
docker compose logs -f
docker compose ps

# backup DB (làm định kỳ!)
cp data/studio.db "data/studio.$(date +%F).db.bak"

# tạm dừng / gỡ (KHÔNG mất data — data ở ./data)
docker compose down
```

### HTTPS (khuyến nghị)
Đặt nginx/Caddy phía trước, proxy `:3000`. Ví dụ Caddy (`/etc/caddy/Caddyfile`):
```
studio.truongvietanh.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## 8. Xử lý sự cố nhanh
| Triệu chứng | Nguyên nhân / xử lý |
|---|---|
| App rỗng, không có atom nào | Chưa nạp `data/studio.db` (bước 4). Copy DB rồi `docker compose restart`. |
| `node:sqlite` báo lỗi / cần cờ | Image không phải Node ≥ 23. Đảm bảo dùng Dockerfile này (Node 24). Nếu buộc dùng Node 22, thêm `NODE_OPTIONS=--experimental-sqlite` vào `.env`. |
| Xuất slide/PDF lỗi, chromium crash | Thiếu RAM/shm. `docker-compose.yml` đã đặt `shm_size: 1gb`; nâng RAM VPS nếu vẫn lỗi. |
| Podcast không có nhạc hiệu/chuẩn âm | edge-tts cần **Internet** (gọi dịch vụ Microsoft). Kiểm tra VPS ra được mạng. |
| `docker compose pull` báo denied | Package Private mà VPS chưa `docker login ghcr.io` (bước 2), hoặc `STUDIO_IMAGE` sai. |
| Đổi mật khẩu login | Sửa `DEMO_PASSWORD` trong `.env` → `docker compose up -d`. |

<!-- test auto-deploy 2026-07-24T09:45:20Z -->
