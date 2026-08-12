# Prompt: đẩy tài nguyên NotebookLM từ Google Drive lên webhook Studio

> Dán prompt bên dưới cho phiên Claude nào ĐANG có Google Drive MCP kết nối (đăng nhập claude.ai, không phải API key qua router). Điền `<...>` trước khi gửi.

---

Tôi cần bạn đẩy tài nguyên học tập từ một thư mục Google Drive vào database của app Studio qua webhook, khớp đúng từng nguyên tử tri thức.

## 1. Nguồn Drive

Thư mục gốc: `<dán link folder Drive, vd https://drive.google.com/drive/u/4/folders/1Iv9fPlAzWajFMOf_bQp_djkJpTlBdqkC>`

Cấu trúc: `Lop10/<Chương>/<Cụm>/<NN>_<Tên-đọc-được>_KC-<7 số>/dok<n>/<Format>_<tên>[_DOK<n>][_hậu tố].<ext>`

- Mã `KC-<7 số>` là **hậu tố** của tên thư mục nguyên tử (không phải toàn bộ tên) — luôn tìm bằng regex `KC-\d{7}` ở bất kỳ đâu trong tên thư mục, không cắt/đoán.
- Thư mục con `dok1`/`dok2`/`dok3` (có thể node chỉ có 1–2 mức, KHÔNG được tự bịa mức còn thiếu).
- Định dạng lấy từ **tên tệp**: `Text`, `Infographic`, `Mindmap`, `Video`, `Audio-tranh-luan`, `Podcast`, `Slide`, `Quiz`, `Flashcards`.

⚠️ **Không dùng `embeddedfolderview` + WebFetch để đọc tên thư mục/tệp** — công cụ tóm tắt của WebFetch CẮT NGẮN tên dài, làm sai lệch mã KC. Dùng `get_file_metadata` (trả `title`/`id` chính xác, không cắt) hoặc `list_recent_files`/`search_files` theo `parentId`.

## 2. Phạm vi cần đẩy lần này

`<liệt kê node cần đẩy, vd: KC-3566611, KC-5110642, KC-3348179 — hoặc "toàn bộ node có trong thư mục">`

## 3. Với mỗi tệp tìm thấy, xác định 2 nhóm

**Nhóm A — định dạng NHẸ (nội dung nhúng thẳng, đọc và gửi `content` là text thật):**
`Text` (.md), `Mindmap` (.html), `Quiz` (.html), `Flashcards` (.html)
→ đọc nội dung file bằng `read_file_content`, gửi nguyên văn HTML/markdown vào trường `content`.

**Nhóm B — định dạng NẶNG (chỉ trỏ về Drive, KHÔNG tải nội dung):**
`Video`, `Audio-tranh-luan`, `Podcast`, `Slide`, `Infographic`
→ chỉ cần `driveFileId` (id của file trên Drive) + `mimeType` (lấy từ `get_file_metadata`).

## 4. Gọi webhook cho từng tệp

```
POST https://factory.vietanh.org/api/tainguyen
Header: X-Api-Key: <khoá webhook — hỏi Hùng, ĐỪNG tự đoán/tự sinh>
Content-Type: application/json
```

Body — định dạng NHẸ (nhóm A):
```json
{
  "atomId": "KC-5110642",
  "dok": 2,
  "format": "Quiz",
  "name": "<tên tệp gốc, không đuôi>",
  "content": "<toàn bộ nội dung HTML/markdown thật>"
}
```

Body — định dạng NẶNG (nhóm B):
```json
{
  "atomId": "KC-5110642",
  "dok": 2,
  "format": "Video",
  "name": "<tên tệp gốc, không đuôi>",
  "driveFileId": "<id file Drive>",
  "mimeType": "video/mp4"
}
```

Quy tắc:
- `dok` = số nguyên 1/2/3 tương ứng thư mục `dok<n>`; nếu file nằm ở mức bài (không chia dok) thì gửi `dok: null`.
- `atomId` PHẢI đúng mã `KC-` tìm được ở tên thư mục nguyên tử (regex ở mục 1), không được đoán/suy diễn.
- `format` PHẢI đúng 1 trong 9 giá trị liệt kê ở mục 3 (phân biệt hoa/thường, có dấu gạch ngang `Audio-tranh-luan`).
- Gọi API là **upsert theo (atomId, format, dok)** — gọi lại cùng bộ 3 giá trị này sẽ ghi đè bản cũ, không tạo trùng. Vì vậy an toàn khi chạy lại/chạy lỡ giữa chừng.
- Nếu 1 file lỗi (network, content rỗng...) thì log lại và tiếp tục file khác, đừng dừng cả lô.

## 5. Sau khi đẩy xong

Gọi `GET https://factory.vietanh.org/api/tainguyen?kc=<KC-...>` (không cần header, chỉ cần cookie đăng nhập hoặc để công khai tuỳ route hiện tại) để in ra danh sách đã lưu cho từng node, đối chiếu số lượng khớp với số tệp thật trên Drive trước khi báo hoàn tất. Báo cáo cuối: tổng số tệp trên Drive theo từng node, tổng số đã đẩy thành công, danh sách lỗi (nếu có).
