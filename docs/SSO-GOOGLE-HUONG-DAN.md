# Lấy Client ID / Client Secret của Google cho Studio

Dành cho người quản lý, không cần biết kỹ thuật. Làm một lần, khoảng 10 phút.
Kết quả: hai chuỗi để bật nút **Tiếp tục với Google** trên trang đăng nhập.

Bối cảnh đã xác minh (28/07/2026): `truongvietanh.com` chạy trên **Google Workspace**
(MX trỏ về `aspmx.l.google.com`), nên email trường chính là tài khoản Google — đăng nhập được ngay.

---

## Các giá trị cần dán (copy nguyên văn, đừng gõ tay)

| Ô trên màn hình Google | Giá trị |
|---|---|
| App name | `Rễ — Học liệu Việt Anh` |
| User support email | email trường của bạn |
| Audience | `Internal` nếu chọn được, không thì `External` |
| Contact email | email trường của bạn |
| Application type | `Web application` |
| Name (tên client) | `Studio web` |
| Authorized JavaScript origins | `https://factory.vietanh.org` |
| Authorized redirect URIs | `https://factory.vietanh.org/api/auth/oidc/callback` |

Địa chỉ quay về phải khớp **từng ký tự** — không thừa dấu `/` ở cuối, không đổi `https` thành `http`.

---

## Bước 1 — Mở Console bằng email trường

1. Vào `console.cloud.google.com`.
2. Bấm ảnh đại diện góc phải, kiểm tra đang là email `@truongvietanh.com`. Nếu đang là Gmail cá nhân thì đổi tài khoản.

## Bước 2 — Tạo project

3. Bấm ô chọn project ở thanh trên cùng (cạnh chữ "Google Cloud").
4. Bấm **New project** (góc phải hộp thoại).
5. Ô **Project name** gõ `Truong Viet Anh`. Ô **Location/Organization** cứ để nguyên.
6. Bấm **Create**, đợi ~15 giây rồi chọn project vừa tạo ở thanh trên cùng.

> Nếu Google báo *"You don't have permission to create projects"*: tổ chức chặn người dùng thường.
> Nhờ người cấp email cho bạn (quản trị Google Workspace) làm giúp từ bước 2 tới bước 12.

## Bước 3 — Khai báo màn hình đồng ý

7. Menu ☰ góc trái → **APIs & Services** → **OAuth consent screen**. (Màn hình có thể tên là **Google Auth Platform**.)
8. Bấm **Get started**.
9. **App Information**: App name gõ `Rễ — Học liệu Việt Anh`; User support email chọn email của bạn → **Next**.
10. **Audience**: chọn **Internal** nếu chọn được → **Next**.
    - Nếu **Internal bị mờ**, chọn **External**. Vẫn an toàn: người ngoài trường bấm được nút nhưng
      app từ chối ở phía máy chủ. Nhớ làm thêm bước 16.
11. **Contact Information**: gõ email của bạn → **Next**.
12. Tích ô đồng ý chính sách → **Create**.

## Bước 4 — Tạo OAuth client (đây mới là chỗ sinh ra hai chuỗi)

13. Menu trái → **Clients** → bấm **+ Create client**.
14. **Application type** chọn **Web application**. **Name** gõ `Studio web`.
15. Kéo xuống:
    - Mục **Authorized JavaScript origins** → **+ Add URI** → dán `https://factory.vietanh.org`
    - Mục **Authorized redirect URIs** → **+ Add URI** → dán `https://factory.vietanh.org/api/auth/oidc/callback`
16. Bấm **Create**. Hộp thoại hiện ra chứa **Client ID** và **Client secret** → bấm **Download JSON** để giữ bản sao.

## Bước 5 — Nếu ở bước 10 bạn chọn External

17. Menu trái → **Audience** → mục **Publishing status** đang là *Testing* → bấm **Publish app** → xác nhận.
    Không làm bước này thì chỉ vài tài khoản test đăng nhập được, người khác bị Google chặn.

---

## Hai chuỗi cần lấy

- **Client ID** — dài, kết thúc bằng `.apps.googleusercontent.com`
- **Client secret** — ngắn hơn, bắt đầu bằng `GOCSPX-`

Dán vào: `factory.vietanh.org` → **Cài đặt** → tab **Phong cách & chi phí** → thẻ **Đăng nhập một lần (Google)**.
Ô thứ ba để `truongvietanh.com`. Bấm **Lưu** — có hiệu lực ngay, không cần khởi động lại.

⚠️ Đừng dán secret vào bất kỳ file nào trong thư mục `studio/` rồi commit: repo GitHub là **public**.

---

## Ba lỗi hay gặp

| Google/app báo | Nguyên nhân | Sửa |
|---|---|---|
| `Error 400: redirect_uri_mismatch` | Địa chỉ quay về sai một ký tự | Sửa lại ở **Clients → Studio web**, đợi vài phút |
| `Error 401: invalid_client` | Secret dán thiếu hoặc dính khoảng trắng | Dán lại, không kèm dấu cách |
| App báo *"Email này không thuộc trường…"* | Đang dùng Gmail cá nhân | Đăng nhập lại bằng email `@truongvietanh.com` |
| `Access blocked: … has not completed the Google verification process` | Chọn External nhưng chưa Publish | Làm bước 17 |

Muốn thử trên máy trước khi đụng bản chạy thật thì thêm hai dòng nữa ở bước 15:
`http://localhost:3000` và `http://localhost:3000/api/auth/oidc/callback`.
