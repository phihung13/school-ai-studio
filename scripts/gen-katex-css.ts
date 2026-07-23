// Sinh src/lib/templates/katex-inline.css = CSS KaTeX + font woff2 nhúng base64.
// Bản xuất HTML tự chứa dùng file này để hiển thị công thức OFFLINE (không CDN, không mạng).
// Chạy lại khi nâng cấp katex: node --experimental-strip-types scripts/gen-katex-css.ts
import fs from "fs";
import path from "path";

const KDIR = path.join(process.cwd(), "node_modules", "katex", "dist");
let css = fs.readFileSync(path.join(KDIR, "katex.min.css"), "utf8");

// 1) url(fonts/X.woff2) → data URI base64
css = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_m, f: string) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(KDIR, "fonts", f)).toString("base64")})`);
// 2) bỏ nhánh woff/ttf còn lại (404 trong file tự chứa) — chỉ giữ woff2
css = css.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, "");

const out = path.join(process.cwd(), "src", "lib", "templates", "katex-inline.css");
fs.writeFileSync(out, css, "utf8");
console.log("wrote", out, (fs.statSync(out).size / 1024 | 0) + "KB", "· còn ref fonts/?", /url\(fonts\//.test(css));
