# Prompt — cắm đăng nhập một lần cho miniapp của Trường Việt Anh

Dán nguyên khối trong ```…``` bên dưới vào công cụ đang dựng app (Claude Code / Cursor / Lovable / v0 / Base44…).
Trước khi dán, sửa 2 dòng đánh dấu `← SỬA`. Không cần sửa gì khác.

Prompt này gộp: hợp đồng app ngoài của trường (Đường A + Biến thể B) **và** những cái giá đã trả khi
cắm thật cho Studio ngày 28/07/2026 — mỗi mục "BẪY" bên dưới là một lỗi đã xảy ra trên bản chạy thật,
không phải lo xa.

Kết quả: app đăng nhập được bằng Google **ngay hôm nay**, và ngày School Data Hub chạy thì chuyển sang
Hub chỉ bằng **đổi hai dòng cấu hình** — không sửa code, không ai phải tạo lại tài khoản.

---

```
Hãy cắm "đăng nhập một lần" (OpenID Connect) vào ứng dụng này.

BỐI CẢNH — đọc kỹ, nó quyết định toàn bộ thiết kế
App này là MINIAPP trong hệ sinh thái Trường Việt Anh. Nhà cung cấp định danh cuối cùng sẽ là
School Data Hub (super app) của trường. Nhưng Hub chưa chạy, nên HÔM NAY tạm đăng nhập qua
Google Workspace của trường. Vì vậy mọi thứ phải viết ở dạng "phích cắm": đổi nhà cung cấp
là đổi CẤU HÌNH, không phải sửa code, và không được làm mất tài khoản/dữ liệu của ai.

Đăng nhập KHÔNG kèm quyền đọc/ghi dữ liệu của Hub. Không viết bất kỳ đoạn mã nào gọi API dữ
liệu của Hub — chưa được cấp, gọi sẽ bị chặn và ghi log.

CẤU HÌNH — đọc TOÀN BỘ từ biến môi trường, không viết cứng giá trị nào trong mã
  APP_URL              = https://<domain-that-cua-app>        ← SỬA
  OIDC_DISCOVERY_URL   = https://accounts.google.com/.well-known/openid-configuration
  OIDC_CLIENT_ID       = (điền sau)
  OIDC_CLIENT_SECRET   = (điền sau, chỉ dùng phía máy chủ)
  OIDC_ALLOWED_DOMAINS = truongvietanh.com                    ← SỬA nếu trường có thêm domain
  scope cố định: openid email profile — KHÔNG xin thêm gì khác

BƯỚC 0 — TỰ KHẢO SÁT TRƯỚC, CHƯA VIẾT CODE
Tự đọc mã nguồn và trả lời (đừng hỏi tôi những gì tìm được trong mã):
  - Ngôn ngữ, framework, cách đăng nhập hiện tại, thư viện OIDC chuẩn của nền tảng này là gì
  - Bảng người dùng tên gì, khóa chính là gì, CÓ CỘT EMAIL KHÔNG, bao nhiêu người dùng đang có email
  - App có phần máy chủ riêng không, hay chỉ chạy trong trình duyệt
  - App chạy thật ở địa chỉ nào, có đứng sau proxy/CDN không
Rồi in ra bản hướng dẫn thao tác Google Cloud Console cho người KHÔNG rành kỹ thuật, đủ 5 phần:
  A. Từng bước bấm ở đâu (mỗi bước một hành động, ghi rõ tên menu và tên nút)
  B. Bảng "Tên ô trên màn hình Google" / "Giá trị cần điền" — giá trị phải HOÀN CHỈNH, copy dán
     thẳng được. Cấm viết "your-domain.com", "<địa chỉ app của bạn>", "…". Không chắc thì đưa
     xuống phần E, đừng để chỗ trống.
  C. Sau khi làm xong tôi phải gửi lại những gì, mỗi thứ trông ra sao
  D. Tôi dán chúng vào đâu (tên file, tên biến), và chỗ nào TUYỆT ĐỐI không được dán
  E. Cách tự biết đã chạy đúng · 3 lỗi hay gặp nhất và cách sửa · những gì bạn cần tôi cung cấp
Hỏi tối đa 3 câu, mỗi câu kèm gợi ý tìm câu trả lời ở đâu.

MẸO: đừng hỏi "email trường có phải Google Workspace không" — tự tra bản ghi MX của domain.
MX trỏ về aspmx.l.google.com nghĩa là Workspace, và khi đó mọi tài khoản trường đều có claim hd.

BƯỚC 1 — HIỆN THỰC

1. THƯ VIỆN. Dùng thư viện OIDC chuẩn, đã được chứng nhận, của nền tảng đang dùng
   (Node: openid-client; Python: authlib; PHP: jumbojett/openid-connect-php; .NET:
   Microsoft.AspNetCore.Authentication.OpenIdConnect). TUYỆT ĐỐI không tự viết giao thức:
   tự viết là mất kiểm chữ ký id_token và mất xoay khóa JWKS, hai thứ không nhìn thấy khi test
   thủ công nhưng là lỗ hổng thật. Cũng KHÔNG dùng gapi / firebase-auth / "Sign in with Google"
   SDK — dùng chúng thì ngày chuyển sang Hub phải viết lại từ đầu.

2. PKCE bắt buộc (S256), kể cả khi app có máy chủ riêng. State ngẫu nhiên, lưu trong cookie
   httpOnly + SameSite=Lax, sống 10 phút, callback so khớp rồi xoá.

3. ĐƯỜNG DẪN TRUNG LẬP NHÀ CUNG CẤP — đặt đúng ngay từ đầu:
      /api/auth/oidc            (bắt đầu đăng nhập)
      /api/auth/oidc/callback   (quay về)
      /api/auth/oidc/backchannel-logout
   BẪY: đừng đặt tên /auth/google/callback. Địa chỉ quay về là "địa chỉ nhà" của app, phải khai
   với nhà cung cấp và KHÔNG đổi khi chuyển sang Hub; mang chữ "google" trong đó là sau này hoặc
   phải khai lại, hoặc ôm một cái tên nói dối.

4. ĐỊA CHỈ CÔNG KHAI. Mọi nơi cần origin (redirect_uri, currentUrl khi đổi mã) phải lấy từ
   APP_URL, thiếu thì đọc header x-forwarded-proto / x-forwarded-host.
   BẪY: sau Cloudflare/Nginx/Coolify, request.url là địa chỉ NỘI BỘ (http://localhost:3000).
   Lấy nhầm nó thì redirect_uri không khớp và nhà cung cấp từ chối — lỗi chỉ xuất hiện trên
   bản chạy thật, máy dev không bao giờ thấy.

5. BẢNG LIÊN KẾT ĐỊNH DANH — phần quan trọng nhất của "phích cắm".
   Tạo bảng identity_links: user_id · issuer · subject · linked_at
     - duy nhất theo (issuer, subject)
     - duy nhất theo (issuer, user_id)
     - khoá dòng nên băm từ chính issuer|subject (vd sha1) → hai request song song không đẻ đôi
   BẪY: KHÔNG khoá tài khoản chỉ theo "sub". Ngày chuyển sang Hub, subject đổi hoàn toàn; có cột
   issuer thì chỉ cần thêm MỘT DÒNG mới, tài khoản và toàn bộ dữ liệu cũ vẫn dính nguyên chủ.

6. THUẬT TOÁN NỐI TÀI KHOẢN (hàm thuần, tách riêng để test được):
     a. Có liên kết (issuer, subject) → dùng đúng tài khoản đó, không hỏi email nữa.
        Nếu tài khoản trỏ tới đã bị xoá → dọn dòng mồ côi rồi xử tiếp như lần đầu.
     b. Chưa có → tìm người dùng theo EMAIL ĐÃ XÁC THỰC (so sánh không phân biệt hoa thường),
        thấy thì gắn liên kết vào chính tài khoản đó, GIỮ NGUYÊN vai trò và dữ liệu.
        Nếu tài khoản đó đã gắn một subject KHÁC của cùng issuer → CHẶN, trả lỗi rõ ràng, không ghi đè.
     c. Không tìm thấy ai → mới mở tài khoản mới, vai thấp nhất (thành viên/giáo viên), không mật khẩu.
   Phải idempotent: đăng nhập 10 lần vẫn một tài khoản, một dòng liên kết.
   BẪY ĐÃ TRẢ GIÁ THẬT: nếu bảng người dùng hiện tại KHÔNG có cột email hoặc email đang rỗng thì
   bước (b) không bao giờ khớp, và MỌI người đăng nhập lần đầu đều bị mở tài khoản trắng — người
   quản trị vào bằng Google sẽ thành thành viên thường. Vì vậy: trước khi bật, kiểm bao nhiêu tài
   khoản đang thiếu email, in con số đó ra cho tôi, và nếu thiếu thì bảo tôi điền trước.

7. HÀNG RÀO NGƯỜI NGOÀI — kiểm ở PHÍA MÁY CHỦ:
     - bắt buộc email_verified = true
     - domain của email phải nằm trong OIDC_ALLOWED_DOMAINS
     - nếu nhà cung cấp là Google: BẮT BUỘC có claim hd và hd phải khớp danh sách domain
       (tài khoản Workspace luôn có hd; tài khoản Google cá nhân thì không → chặn được kẻ mạo danh)
     - nhà cung cấp khác (Hub) không phát hd → chỉ xét domain email
     - chưa khai domain nào → chặn hết (mặc định an toàn)
   BẪY: tham số hd gửi kèm lúc chuyển hướng CHỈ là gợi ý giao diện. Không kiểm lại phía máy chủ thì
   bất kỳ Gmail nào cũng vào được.

8. PHIÊN PHẢI THU HỒI ĐƯỢC + BACK-CHANNEL LOGOUT (làm ngay, đừng để nợ).
   Hub sẽ TỪ CHỐI đăng ký nếu app không khai backchannel_logout_uri (ADR-016).
     - Mở endpoint /api/auth/oidc/backchannel-logout nhận logout_token, xác thực chữ ký bằng
       thư viện, rồi đóng phiên phía app NGAY.
     - Nếu phiên của app là JWT tự cuộn (stateless) thì hiện không thu hồi được: thêm mốc
       sessions_valid_from trên mỗi tài khoản, khi xác thực token thì so thời điểm phát với mốc
       này; back-channel logout chỉ việc đẩy mốc lên hiện tại. Làm lúc này tốn 20 phút, làm sau
       khi đã có người dùng thì phải đăng xuất toàn trường.
     - Có nút Đăng xuất gọi end_session_endpoint của nhà cung cấp, không chỉ xoá cookie.
     - Token/hồ sơ người dùng KHÔNG cache quá 15 phút — hết hạn thì hỏi lại, đó chính là lúc
       nhà cung cấp từ chối nếu tài khoản đã bị khoá.

9. GIỮ NGUYÊN ĐƯỜNG CŨ. Không tắt, không ẩn cách đăng nhập hiện có. Chạy song song — có người
   quên, có người đổi email, có người không có tài khoản trường.

10. NÚT TRÊN TRANG ĐĂNG NHẬP chỉ hiện khi đã khai đủ client id + secret, và chữ trên nút đi theo
    nhà cung cấp đang cấu hình ("Tiếp tục với Google" → sau này tự thành "Tiếp tục với tài khoản
    trường"). Mọi lỗi trả về phải dịch sang tiếng Việt cho người dùng, đừng in mã lỗi kỹ thuật.

11. CẤM:
    - nhúng client_secret vào mã chạy trong trình duyệt
    - lưu hay hiển thị mã học sinh, tên thật học sinh, số điện thoại, ngày sinh lấy từ nguồn khác;
      app chỉ được biết những gì id_token trả về, và chỉ giữ tên trong phiên làm việc
    - commit secret vào repo (kiểm .gitignore trước; nếu repo là public thì nói rõ cho tôi)

BÀI KIỂM BẮT BUỘC — viết thành file test chạy lại được, không phải thử tay
  1. Đăng nhập 10 lần → đúng 1 tài khoản, đúng 1 dòng liên kết
  2. Người đã có tài khoản cũ (email trùng) đăng nhập → vào đúng tài khoản đó, GIỮ vai trò, không đẻ hồ sơ mới
  3. Đổi nhà cung cấp: cùng email, issuer khác, subject khác hẳn → vẫn ra đúng người, có 2 dòng liên kết
  4. Email đã gắn subject khác của cùng issuer → bị chặn, không ghi đè
  5. Tài khoản đã bị xoá để lại liên kết mồ côi → tự dọn và nối lại đúng người
  6. Gmail cá nhân, email chưa xác thực, claim hd của tổ chức khác, domain lồng kiểu
     truongvietanh.com.evil.net → chặn hết
  7. Chưa khai domain nào → chặn hết
  8. Luồng HTTP: thiếu cookie bắt tay → từ chối; state không khớp → từ chối; bấm Huỷ → về trang
     đăng nhập kèm thông báo tiếng Việt

THỨ TỰ TRIỂN KHAI — làm đúng thứ tự này
  1. Deploy code TRƯỚC (nút vẫn ẩn vì chưa khai key — không ai bị ảnh hưởng)
  2. Rồi mới khai client id/secret, qua giao diện quản trị của app
  BẪY: nếu app đồng bộ cấu hình lên kho ngoài (Supabase/Firestore…), đừng ghi thẳng key vào kho
  đó trong lúc bản cũ đang chạy — bản cũ giữ cấu hình trong RAM và sẽ đè mất key ở lần ghi kế tiếp.

NGÀY CHUYỂN SANG HUB — phải đúng hai dòng, không hơn
  OIDC_DISCOVERY_URL → <HUB_URL>/.well-known/openid-configuration
  OIDC_CLIENT_ID / OIDC_CLIENT_SECRET → cấp mới
Địa chỉ quay về giữ nguyên. Bảng liên kết giữ nguyên. Không ai phải đăng ký lại.
Nếu thiết kế của bạn cần sửa thêm bất cứ dòng code nào, nghĩa là bước 5 hoặc bước 3 đã làm sai.

BÁO CÁO LẠI ĐÚNG 7 MỤC (phía Hub cần chừng này để đăng ký app)
  1. redirect_uri chính xác, đầy đủ https://
  2. backchannel_logout_uri chính xác
  3. App có máy chủ riêng không (quyết định cấp secret hay dùng public client + PKCE)
  4. Thư viện OIDC đã dùng, kèm phiên bản
  5. Tên bảng liên kết định danh và các cột
  6. Kết quả chạy test: liệt kê từng phép kiểm ở trên, đạt/hỏng
  7. Bao nhiêu tài khoản hiện có đang THIẾU email (con số này quyết định có bật được ngay không)
```

---

## Ghi chú cho người dán prompt

**App mới toanh, chưa có người dùng** — bỏ được mục 6b (nối theo email) và mục 7 của báo cáo.
Vẫn phải giữ nguyên bảng liên kết có cột `issuer`: đó là thứ duy nhất khiến ngày chuyển Hub
không phải làm lại từ đầu.

**Kiểm nhanh bên nhận (phía Hub / người duyệt)**
1. `redirect_uri` khớp chính xác, không wildcard, không khớp theo tiền tố.
2. Có khai `backchannel_logout_uri` — thiếu là từ chối đăng ký (ADR-016).
3. App không có máy chủ riêng → đăng ký public client + PKCE, **không cấp** `client_secret`.
4. Bảng liên kết có cột `issuer` và cả hai ràng buộc duy nhất.
5. Chạy lại 3 phép kiểm bắt buộc: đăng nhập lần 2 không tạo liên kết đôi · `external_id` đã map
   người khác thì bị chặn · thiếu PKCE hoặc sai redirect thì `/authorize` từ chối.

**Bản tham chiếu đã chạy thật**: Studio (`factory.vietanh.org`) — `src/lib/oidc.ts`,
`src/lib/identity-link.ts`, `src/app/api/auth/oidc/*`, test ở `scripts/test-identity-link.mjs`.
Chỗ duy nhất Studio còn nợ so với prompt này là mục 8 (back-channel logout) — đó chính là lý do
prompt bắt làm ngay từ đầu thay vì để sau.
