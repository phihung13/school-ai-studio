# Spec: Đẩy học liệu Chuẩn trường từ Studio sang app Gia sư (tutor)

> Chép lại từ ghi chú phiên 2026-07-15 (file gốc bị mất), CẬP NHẬT 16/07 theo trả lời
> chính thức của bên tutor (envelope, enum môn, cơ chế uri). Kênh: HTTP API, một chiều Studio → tutor.

## Endpoint

```
POST https://gxbxsdhvtwtjkfygetzb.supabase.co/functions/v1/import-kg
```

Headers:

| Header | Giá trị |
|---|---|
| `Content-Type` | `application/json` |
| `apikey` | `sb_publishable_BYthnvkNq8azqs_Xr-P_8w_itKKV-UQ` |
| `Authorization` | `Bearer <JWT teacher/admin/leadership của tutor>` |

## Body — khuôn `va.kg-bundle/2.2` (mẫu CHUẨN do tutor xác nhận 16/07)

```json
{
  "schema": "va.kg-bundle/2.2",
  "subject": "Toan",
  "version_label": "studio-export",
  "resources": [
    { "id": "as_37710f27ed2e", "node_id": "TO10-C03-B04", "format": "flashcard",
      "tier": 1, "uri": "studio/TO10-C03-B04/as_37710f27ed2e.html" }
  ]
}
```

Mỗi item trong `resources[]`:

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `id` | ✔ | **ỔN ĐỊNH** — gửi lại cùng id thì ĐÈ bản cũ, không nhân bản. Studio dùng assetId. |
| `node_id` | ✔ | = mã nguyên tử, PHẢI TRÙNG mã bên tutor, vd `TO10-C06-B01` |
| `format` | ✔ | ∈ `text` `infographic` `video` `animation` `mindmap` `podcast` `worked_example` `interactive` `slide` `worksheet` `flashcard` `quiz` |
| `tier` | ✔ | 1–3 |
| `uri` | ✔ | **ĐƯỜNG DẪN TRONG BUCKET** (vd `studio/…/file.html`) — KHÔNG phải URL public. Bucket không public (chủ ý): tutor tự ký signed URL 1 giờ mỗi lần học sinh mở. |
| `ly_do_chon_format` | ✘ | |
| `dual_coding` | ✘ | |
| `accessibility` | ✘ | |

- `version_label` (string tự chọn) là trường BẮT BUỘC của envelope — Studio dùng `"studio-export"`.
- `subject` ∈ `Toan` \| `Hoa` \| `Anh` \| `Van` (LƯU Ý: Tiếng Anh = `Anh`, không phải "Anh Van").
  Tình trạng published 16/07: Toán + Tiếng Anh nhận ngay; **Hóa chưa published → 409** (cần thì báo tutor publish); Văn chưa rõ.
- CHỈ đẩy asset **ĐÃ duyệt** (tutor nhận active ngay, không duyệt lại).
- Học liệu không tính mastery → không cần gửi đáp án.

## Phản hồi

| Mã | Ý nghĩa |
|---|---|
| 200 | `{resources: n}` — nhận xong |
| 409 | Môn chưa published ở tutor |
| 422 | Sai chuẩn — trả `issues[]` chỉ rõ lỗi |
| 401/403 | JWT sai / thiếu quyền |

## Upload file lên bucket (ĐÃ MỞ 16/07)

- Bucket `learning-assets`, đường dẫn `studio/<mã-nguyên-tử>/<assetId>.<ext>`, header `x-upsert: true` (đẩy lại là đè, link không đổi).
- Policy: vai teacher được INSERT/UPDATE/SELECT **chỉ trong prefix `studio/*`** — ngoài prefix bị chặn.
- Tài khoản teacher tutor: `tt@vietanh.edu.vn` (mật khẩu lưu trong Cài đặt Studio → Kết nối app Gia sư, không ghi ra file).
- Trong bucket có file probe vô hại `studio/_probe/permission-check.txt` từ lúc tutor test — để nguyên.

## Kiểm chứng khi chạy thật

Đẩy 1 asset (node `TO10-C03-B04` — Định lí sin — đã xác nhận tồn tại & active bên tutor) → báo bên tutor
kiểm bằng tài khoản học sinh `hs2@vietanh.edu.vn`: vào node đó thấy ở "bài đặc biệt" và mở chạy được.
