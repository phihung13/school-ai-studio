import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import ChunkGuard from "@/components/chunk-guard";

const viet = Be_Vietnam_Pro({
  variable: "--font-viet",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

// APP_URL để link chia sẻ ra ngoài (ảnh og) trỏ đúng tên miền thật; thiếu thì lấy địa chỉ production.
const SITE = (process.env.APP_URL || "https://factory.vietanh.org").replace(/\/+$/, "");
const TITLE = "Rễ — Nền tảng học liệu Trường Việt Anh";
const DESC = "Xây cây kiến thức, biên soạn học liệu có AI hỗ trợ, chuyển thể thành mọi định dạng.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s · Rễ" },
  description: DESC,
  applicationName: "Rễ",
  // icon.svg / apple-icon.png / favicon.ico trong src/app tự được Next gắn vào <head>
  appleWebApp: { capable: true, title: "Rễ", statusBarStyle: "default" },
  openGraph: { type: "website", siteName: "Rễ — Học liệu Việt Anh", title: TITLE, description: DESC, locale: "vi_VN", url: SITE },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
  robots: { index: false, follow: false }, // app nội bộ của trường — đừng để lọt lên máy tìm kiếm
};

export const viewport: Viewport = {
  themeColor: "#1c8742", // --color-brand: thanh trạng thái điện thoại ăn màu app
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${viet.variable} h-full`}>
      <body className="min-h-full"><ChunkGuard />{children}</body>
    </html>
  );
}
