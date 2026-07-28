import type { MetadataRoute } from "next";

// Cho phép cài app lên màn hình chính (điện thoại giáo viên) và chạy dạng cửa sổ riêng, không thanh địa chỉ.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rễ — Học liệu Việt Anh",
    short_name: "Rễ",
    description: "Cây kiến thức của trường · AI hỗ trợ biên soạn học liệu: slide, quiz, video, podcast.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "vi",
    background_color: "#fbfefc", // --color-canvas
    theme_color: "#1c8742",      // --color-brand
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon.ico", sizes: "48x48 32x32 16x16", type: "image/x-icon" },
    ],
  };
}
