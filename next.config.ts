import type { NextConfig } from "next";

// Ai được nhúng Factory trong iframe. Factory là miniapp của School Data Hub (super app) nên Hub phải
// nhúng được; để trống thì BẤT KỲ site nào cũng nhúng được và dựng được trò clickjacking trên chính
// giao diện duyệt học liệu. Đổi/thêm origin bằng biến môi trường, không phải sửa code.
const EMBED_ORIGINS = (process.env.EMBED_ANCESTORS || "https://hub.truongvietanh.com").trim();

const nextConfig: NextConfig = {
  // anki-apkg-export (và sql.js nó kéo theo) có require kiểu webpack cũ ("script-loader!sql.js")
  // → Turbopack bundle tĩnh sẽ vỡ. Khai external để require lúc CHẠY trong Node (nhánh browser không bao giờ chạy).
  serverExternalPackages: ["anki-apkg-export", "sql.js"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        // frame-ancestors thay cho X-Frame-Options: cho phép NHIỀU origin (self + Hub), thứ mà
        // X-Frame-Options không làm được. Trình duyệt ưu tiên CSP nên không cần khai cả hai.
        { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${EMBED_ORIGINS}` },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};

export default nextConfig;
