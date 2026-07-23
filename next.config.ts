import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // anki-apkg-export (và sql.js nó kéo theo) có require kiểu webpack cũ ("script-loader!sql.js")
  // → Turbopack bundle tĩnh sẽ vỡ. Khai external để require lúc CHẠY trong Node (nhánh browser không bao giờ chạy).
  serverExternalPackages: ["anki-apkg-export", "sql.js"],
};

export default nextConfig;
