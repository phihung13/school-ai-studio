// ── Sinh bộ nhận diện của app từ MỘT nguồn: chiếc lá trong shell (LeafMark) + màu brand trong globals.css ──
// Chạy: node scripts/gen-icons.mjs
// Ra: src/app/icon.svg · src/app/favicon.ico · src/app/apple-icon.png · src/app/opengraph-image.png
// Sửa màu/hình thì sửa ở đây rồi chạy lại — đừng vẽ tay từng file, bộ icon sẽ lệch nhau.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const APP = path.join(process.cwd(), "src", "app");

// ===== màu: đọc thẳng từ token oklch của globals.css để icon không bao giờ lệch tông với giao diện =====
function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return "#" + lin.map(enc).map((v) => v.toString(16).padStart(2, "0")).join("");
}
const BRAND = oklchToHex(0.55, 0.14, 150);       // --color-brand
const BRAND_DEEP = oklchToHex(0.37, 0.11, 152);  // --color-brand-deep
const ON_BRAND = oklchToHex(0.995, 0.008, 150);  // --color-on-brand
const CANVAS = oklchToHex(0.988, 0.006, 150);    // --color-canvas
const INK = oklchToHex(0.25, 0.03, 162);         // --color-ink
const MUTED = oklchToHex(0.56, 0.022, 155);      // --color-muted

// ===== chiếc lá: ĐÚNG path của LeafMark trong shell.tsx (lưới 24×24) =====
const LEAF = "M20 4C11 4 4 10 4 19c0 0 0 1 1 1 9 0 15-6 15-15 0 0 0-1-0-1Z";
const VEIN = "M6 18C10 13 14 10 18 8";

// Lá đặt trong khung vuông cạnh `size`, chừa lề `pad` — dùng chung cho icon và ảnh chia sẻ.
// vein=false: bỏ gân lá. Ở 16px gân chỉ còn ~1px, nó không thành nét mà thành vệt xám làm nhòe cả chiếc lá.
function leafGroup(size, pad, { vein = true, veinWidth = 1.5 } = {}) {
  const k = (size - pad * 2) / 24;
  return `<g transform="translate(${pad} ${pad}) scale(${k})">
    <path d="${LEAF}" fill="${ON_BRAND}"/>
    ${vein ? `<path d="${VEIN}" stroke="${BRAND_DEEP}" stroke-opacity="0.5" stroke-width="${veinWidth}" stroke-linecap="round" fill="none"/>` : ""}
  </g>`;
}

// Icon: nền bo góc chuyển sắc brand → brand-deep (ở 16px vẫn ra khối), lá trắng ở giữa.
// Bản nhỏ (tab trình duyệt) cố tình để lá TO và trơn; bản lớn mới thêm gân cho có chiều sâu.
const iconSvg = (size = 64, { vein = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${BRAND}"/><stop offset="1" stop-color="${BRAND_DEEP}"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>
  ${leafGroup(size, size * (vein ? 0.17 : 0.12), { vein, veinWidth: 1.5 })}
</svg>`;

// Ảnh chia sẻ link (Zalo/Messenger/Slack…): nền brand, huy hiệu lá + tên nền tảng.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND}"/><stop offset="1" stop-color="${BRAND_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="${CANVAS}"/>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1040" cy="120" r="220" fill="${ON_BRAND}" opacity="0.06"/>
  <circle cx="150" cy="560" r="180" fill="${ON_BRAND}" opacity="0.05"/>
  <rect x="96" y="150" width="132" height="132" rx="34" fill="${ON_BRAND}" opacity="0.14"/>
  ${leafGroup(132, 26).replace("translate(26 26)", "translate(122 176)")}
  <text x="96" y="380" font-family="Segoe UI, Be Vietnam Pro, Arial, sans-serif" font-size="104" font-weight="700" fill="${ON_BRAND}">Rễ</text>
  <text x="262" y="380" font-family="Segoe UI, Be Vietnam Pro, Arial, sans-serif" font-size="44" font-weight="600" fill="${ON_BRAND}" opacity="0.9">Học liệu Việt Anh</text>
  <text x="96" y="452" font-family="Segoe UI, Be Vietnam Pro, Arial, sans-serif" font-size="33" fill="${ON_BRAND}" opacity="0.82">Cây kiến thức của trường · AI hỗ trợ biên soạn học liệu</text>
  <rect x="96" y="510" width="360" height="6" rx="3" fill="${ON_BRAND}" opacity="0.35"/>
</svg>`;

// ===== ICO: gói vài cỡ PNG vào một file (Windows/Chrome đọc PNG trong ICO từ lâu) =====
function buildIco(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const dir = [], body = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length; dir.push(e); body.push(data);
  }
  return Buffer.concat([head, ...dir, ...body]);
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

fs.writeFileSync(path.join(APP, "icon.svg"), iconSvg(64));
const ico = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(iconSvg(256), size) })));
fs.writeFileSync(path.join(APP, "favicon.ico"), buildIco(ico));
fs.writeFileSync(path.join(APP, "apple-icon.png"), await png(iconSvg(256, { vein: true }), 180));
fs.writeFileSync(path.join(APP, "opengraph-image.png"), await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toBuffer());

console.log(`Xong. brand=${BRAND} deep=${BRAND_DEEP} ink=${INK} muted=${MUTED}`);
for (const f of ["icon.svg", "favicon.ico", "apple-icon.png", "opengraph-image.png"]) {
  console.log(`  src/app/${f} — ${(fs.statSync(path.join(APP, f)).size / 1024).toFixed(1)} KB`);
}
