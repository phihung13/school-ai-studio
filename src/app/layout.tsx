import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Rễ — Nền tảng học liệu Trường Việt Anh",
  description: "Xây cây kiến thức, biên soạn học liệu có AI hỗ trợ, chuyển thể thành mọi định dạng.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${viet.variable} h-full`}>
      <body className="min-h-full"><ChunkGuard />{children}</body>
    </html>
  );
}
