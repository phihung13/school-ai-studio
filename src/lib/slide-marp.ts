// ── Render slide bằng Marp: JSON (SlideContentV2) → Marp Markdown + theme CSS → PPTX/PDF/PNG ──
// "ppt-master full": mỗi slide được CHỌN BỐ CỤC theo nội dung (cover/stat/cards/steps/split/…),
// dựng HOÀN TOÀN bằng HTML (không dùng cú pháp markdown → không bao giờ lọt "##" ra slide),
// và lớp trang trí `decor` do lượt đạo diễn mỹ thuật đặt được VẼ THẬT theo tọa độ %.
// Độ đẹp do theme CSS (marp-va-*.css) quyết định; module này chỉ chọn layout và map dữ liệu ra HTML.
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { readableMath, niceTicks } from "./shared";
import type { SlideV2, SlideChart, SlideTable, DecorEl } from "./schemas/slide";
type SlideCard = NonNullable<SlideV2["cards"]>[number];

const rm = readableMath;
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// **đậm** / *nghiêng* trong dữ liệu → thẻ thật (markdown KHÔNG được parse vì ta phát HTML thuần)
const rmEsc = (s: string) =>
  esc(rm(s))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");

interface Palette { series: string[]; grid: string; axis: string; ink: string; muted: string }

// ── THƯ VIỆN MẪU TRÌNH BÀY ──
// Màu BIỂU ĐỒ SVG theo từng mẫu (đồng bộ tông). Danh sách mẫu (id/nhãn/mô tả) ở shared.ts:SLIDE_TEMPLATES
// để client dùng chung; ở đây chỉ giữ bảng màu chart. Thêm mẫu = thêm 1 dòng ở cả hai + 1 file CSS.
export type MarpTheme = string;
export type MarpFormat = "pptx" | "pdf";
const PALETTE: Record<string, Palette> = {
  "va-green": { series: ["#1E4D38", "#C9A94E", "#5B9E7E"], grid: "#E4EBE6", axis: "#9AAA9E", ink: "#1A2620", muted: "#6B7A6E" },
  "va-minimal": { series: ["#2B2B33", "#C2703D", "#8A8A96"], grid: "#ECECEE", axis: "#B7B7BE", ink: "#22222A", muted: "#75757F" },
  "va-ocean": { series: ["#1E6FB8", "#12B5B0", "#F2A93B"], grid: "#E3EEF6", axis: "#9DB6C8", ink: "#14304A", muted: "#5B7488" },
  "va-night": { series: ["#67E8C3", "#F6C560", "#7CB8FF"], grid: "#2A3A44", axis: "#4A5D68", ink: "#EAF2EE", muted: "#9DB1AB" },
  "va-chalk": { series: ["#FFF3C4", "#7FD1B9", "#F4A9C0"], grid: "#33564A", axis: "#5C7E70", ink: "#F3F6EE", muted: "#B9C9BC" },
  "va-editorial": { series: ["#A32A22", "#C6862E", "#5B6152"], grid: "#E5DFD4", axis: "#B7ADA0", ink: "#201C18", muted: "#6E655C" },
  "va-bloom": { series: ["#6E9A3E", "#EC894A", "#E7B93F"], grid: "#E4E8CB", axis: "#B3BE94", ink: "#47512F", muted: "#7E8863" },
  "va-kids": { series: ["#FF6A3D", "#3D6AFF", "#2BB673"], grid: "#EDE7F3", axis: "#B0A6BE", ink: "#2A2340", muted: "#6E6484" },
};
const DEFAULT_PALETTE = PALETTE["va-green"];

// ── Biểu đồ SVG (đồng số học với chart PPTX/web; vẽ sạch: lưới nhạt, nhãn rõ, không rối) ──
// wide = chart chiếm CẢ slide (khung ~1136×428 → tỉ lệ 2.6); hẹp = chart nằm trong 1 cột (~600×440).
// Vẽ đúng tỉ lệ khung thì chart lấp đầy; sai tỉ lệ thì preserveAspectRatio co lại, viền đen hai bên, chữ bé.
function chartSvg(chart: SlideChart, p: Palette, wide = false): string {
  const W = wide ? 1120 : 620, H = wide ? 424 : 440;
  const P = { l: 66, r: 22, t: chart.series.length > 1 ? 40 : 24, b: chart.xLabel ? 62 : 42 };
  const all = chart.series.flatMap((s) => s.values);
  const { ticks, lo: mn, hi: max } = niceTicks(Math.min(0, ...all), Math.max(...all, 1));
  const n = chart.categories.length, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = (k: number) => P.l + (n > 1 ? (k * iw) / (n - 1) : iw / 2);
  const Y = (v: number) => P.t + ih - ((v - mn) * ih) / (max - mn || 1);
  const y0 = Y(0);
  const bw = Math.min(48, ((iw / n) * 0.62) / chart.series.length);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" font-family="Be Vietnam Pro, Segoe UI, system-ui, Arial, sans-serif">`;
  for (const t of ticks)
    out += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${p.grid}"/><text x="${P.l - 10}" y="${Y(t) + 4}" text-anchor="end" font-size="13" fill="${p.muted}">${Number.isInteger(t) ? t : t.toFixed(1)}</text>`;
  out += `<line x1="${P.l}" x2="${W - P.r}" y1="${y0}" y2="${y0}" stroke="${p.axis}" stroke-width="1.4"/><line x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${Y(mn)}" stroke="${p.axis}" stroke-width="1.4"/>`;
  chart.categories.forEach((cat, k) => {
    out += `<text x="${chart.type === "bar" ? P.l + (k + 0.5) * (iw / n) : X(k)}" y="${H - P.b + 22}" text-anchor="middle" font-size="13.5" fill="${p.ink}">${esc(rm(cat))}</text>`;
  });
  if (chart.xLabel) out += `<text x="${P.l + iw / 2}" y="${H - 10}" text-anchor="middle" font-size="13" fill="${p.muted}">${esc(rm(chart.xLabel))}</text>`;
  if (chart.yLabel) out += `<text x="16" y="${P.t + ih / 2}" text-anchor="middle" font-size="13" fill="${p.muted}" transform="rotate(-90 16 ${P.t + ih / 2})">${esc(rm(chart.yLabel))}</text>`;
  chart.series.forEach((se, si) => {
    const col = p.series[si % p.series.length];
    if (chart.type === "bar") {
      se.values.forEach((v, k) => {
        const gx = P.l + (k + 0.5) * (iw / n) - (bw * chart.series.length) / 2 + si * bw;
        out += `<rect x="${gx}" y="${Math.min(Y(v), y0)}" width="${bw - 4}" height="${Math.max(1, Math.abs(y0 - Y(v)))}" rx="4" fill="${col}"/><text x="${gx + (bw - 4) / 2}" y="${v >= 0 ? Y(v) - 7 : Y(v) + 17}" text-anchor="middle" font-size="13" font-weight="700" fill="${p.ink}">${v}</text>`;
      });
    } else {
      out += `<polyline points="${se.values.map((v, k) => `${X(k)},${Y(v)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      se.values.forEach((v, k) => {
        out += `<circle cx="${X(k)}" cy="${Y(v)}" r="5.5" fill="#fff" stroke="${col}" stroke-width="2.8"/><text x="${X(k)}" y="${Y(v) - 12}" text-anchor="middle" font-size="13" font-weight="700" fill="${p.ink}">${v}</text>`;
      });
    }
  });
  if (chart.series.length > 1) {
    let lx = P.l;
    chart.series.forEach((se, si) => {
      const name = se.name.length > 22 ? se.name.slice(0, 21) + "…" : se.name;
      out += `<rect x="${lx}" y="6" width="13" height="13" rx="3.5" fill="${p.series[si % p.series.length]}"/><text x="${lx + 19}" y="17" font-size="13" fill="${p.ink}">${esc(rm(name))}</text>`;
      lx += 30 + name.length * 7;
    });
  }
  return out + "</svg>";
}

// bọc div: <table> là grid item KHÔNG nhận stretch → bảng co lại bằng nội dung, lệch trái.
// Nằm trong khối block width:100% thì width:100% của table mới ăn.
const tableHtml = (t: SlideTable) =>
  `<div class="tblw"><table class="tbl"><thead><tr>${t.headers.map((h) => `<th>${rmEsc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${rmEsc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;

const cardsHtml = (cards: SlideCard[]) =>
  `<div class="cards n${cards.length}">${cards
    .map((c, i) => `<div class="card c${i % 3}">${c.icon ? `<div class="ci">${esc(c.icon)}</div>` : ""}<h4>${rmEsc(c.title)}</h4>${c.text ? `<p>${rmEsc(c.text)}</p>` : ""}</div>`)
    .join("")}</div>`;

const stepsHtml = (steps: string[]) =>
  `<ol class="steps${steps.length > 4 ? " two" : ""}">${steps
    .map((st) => `<li><span class="tx">${rmEsc(st).replace(/^[①-⑨\d]+[.)\s]*/, "")}</span></li>`)
    .join("")}</ol>`;

// bullet có sắc thái: "Sai: …" đỏ, "Đúng: …" xanh, "Nhớ/Lưu ý/Mẹo: …" brass — mắt bắt được ngay
// đâu là bẫy, đâu là chốt, không phải đọc hết mới hiểu.
const toneOf = (s: string) =>
  /^\s*(sai|lỗi|nhầm|bẫy)\s*[:.]/i.test(s) ? " bad"
  : /^\s*(đúng|chuẩn|phải)\s*[:.]/i.test(s) ? " good"
  : /^\s*(nhớ|lưu ý|mẹo|chú ý)\s*[:.]/i.test(s) ? " tip" : "";
const bulletsHtml = (items: string[]) =>
  `<ul class="blist">${items.map((b) => `<li class="row${toneOf(b)}"><span class="tx">${rmEsc(b)}</span></li>`).join("")}</ul>`;

const statHtml = (stat: NonNullable<SlideV2["stat"]>) =>
  `<div class="stat"><div class="val">${rmEsc(stat.value)}</div><div class="lbl">${rmEsc(stat.label)}</div></div>`;

// ── Lớp trang trí: tọa độ % canvas → phần tử absolute. Rào an toàn: decor "front" chỉ được
//    nằm ở RÌA (ngoài vùng chữ 10–90% × 12–88%) — nếu không, đẩy xuống nền để không đè nội dung. ──
const DECOR_COLOR: Record<string, string> = { brand: "var(--d-brand)", brass: "var(--d-brass)", mist: "var(--d-mist)", white: "#ffffff", ink: "var(--d-ink)" };
function decorHtml(list: DecorEl[] | undefined): string {
  if (!list?.length) return "";
  const back: string[] = [], front: string[] = [];
  const svgBits: string[] = [];
  for (const d of list.slice(0, 7)) {
    const col = DECOR_COLOR[d.color || "brand"] || DECOR_COLOR.brand;
    const op = (d.opacity ?? 18) / 100;
    const inSafe = d.x > 10 && d.x < 90 && d.y > 12 && d.y < 88;
    const isFront = !!d.front && !inSafe && (d.kind === "sticker" || d.kind === "chip");
    const bucket = isFront ? front : back;
    const pos = `left:${d.x}%;top:${d.y}%`;
    if (d.kind === "blob")
      bucket.push(`<div class="dc blob" style="${pos};width:${d.w ?? 24}%;height:${d.h ?? d.w ?? 24}%;background:${col};opacity:${op}"></div>`);
    else if (d.kind === "ring")
      bucket.push(`<div class="dc ring" style="${pos};width:${d.w ?? 18}%;height:${d.h ?? d.w ?? 18}%;border-color:${col};opacity:${Math.max(op, 0.22)}"></div>`);
    else if (d.kind === "sticker")
      bucket.push(`<div class="dc stk" style="${pos};font-size:${(d.size ?? 7) * 7.2}px;opacity:${Math.max(op, 0.55)}">${esc(d.text || "✨")}</div>`);
    else if (d.kind === "chip")
      bucket.push(`<div class="dc chip" style="${pos};background:${col};opacity:${Math.max(op, 0.85)}">${rmEsc(d.text || "")}</div>`);
    else {
      // arrow / line → vẽ trong MỘT lớp SVG phủ toàn canvas (tọa độ % → viewBox 100×100).
      // RÀO AN TOÀN: chỉ vẽ khi đoạn thẳng nằm TRỌN ở một rìa. Một đường chéo cắt ngang vùng chữ
      // trông đúng như vết xước trên slide — thà bỏ còn hơn.
      const x2 = d.x2 ?? d.x + 12, y2 = d.y2 ?? d.y;
      const edgeOnly =
        (d.y <= 12 && y2 <= 12) || (d.y >= 88 && y2 >= 88) || (d.x <= 10 && x2 <= 10) || (d.x >= 90 && x2 >= 90);
      if (!edgeOnly) continue;
      const head = d.kind === "arrow" ? ` marker-end="url(#ah)"` : "";
      svgBits.push(`<line x1="${d.x}" y1="${d.y}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="0.5" stroke-linecap="round" opacity="${Math.max(op, 0.4)}"${head}/>`);
    }
  }
  const svg = svgBits.length
    ? `<svg class="dc dsvg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="ah" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--d-brass)"/></marker></defs>${svgBits.join("")}</svg>`
    : "";
  return (
    (back.length || svg ? `<div class="decor back">${svg}${back.join("")}</div>` : "") +
    (front.length ? `<div class="decor front">${front.join("")}</div>` : "")
  );
}

// ── Chọn BỐ CỤC theo nội dung — trái tim của "ppt-master": hình thức bám nội dung ──
type Layout = "cover" | "closing" | "stat" | "cards" | "steps" | "split" | "visual" | "text";
function layoutOf(s: SlideV2, i: number, n: number): Layout {
  if (i === 0) return "cover";
  const rich = !!(s.chart || s.table || s.steps?.length || s.cards?.length || s.stat);
  if (i === n - 1 && !rich && s.bullets?.length) return "closing";
  if (s.chart && s.table) return "split";
  const visual = s.chart || s.table;
  if (visual && s.bullets?.length) return "split";   // chữ dẫn dắt trái · trực quan phải
  if (visual) return "visual";
  if (s.cards?.length) return "cards";
  if (s.steps?.length) return "steps";
  if (s.stat) return "stat";
  return "text";
}

// nhãn định hướng — nói cho người xem biết slide này ĐỂ LÀM GÌ
function kickerOf(s: SlideV2, warn: boolean): string {
  if (warn) return "CẨN THẬN";
  if (/luyện tập|thử sức|đến lượt|thử thách|bài tập/i.test(s.title)) return "LUYỆN TẬP";
  if (s.chart) return "TRỰC QUAN HÓA";
  if (s.table) return "SỐ LIỆU THẬT";
  if (s.steps?.length) return "CÁC BƯỚC LÀM";
  if (s.cards?.length) return "Ý CHÍNH";
  if (s.stat) return "CON SỐ BIẾT NÓI";
  return ""; // KHÔNG nhãn generic "BÀI HỌC" — chữ lặp y hệt mọi slide (Hùng chê "element lặp đi lặp lại")
}

// Trên trang NỘI DUNG, trang trí chỉ là ĐIỂM NHẤN THƯA — không phải đồ đạc cố định mỗi slide.
// Bỏ chip/sticker/mũi tên (chính chúng gây cảm giác lặp: viên pill góc dưới phải + icon mờ góc trên
// phải trang nào cũng có); giữ TỐI ĐA 1 khối mềm (blob/ring) làm nền; slide đã nhiều hình
// (thẻ/bảng/biểu đồ) thì để TRỐNG cho thở.
const contentDecor = (list: DecorEl[] | undefined, lay: Layout): string => {
  if (!list?.length || lay === "cards" || lay === "split" || lay === "visual") return "";
  const soft = list.filter((d) => d.kind === "blob" || d.kind === "ring").slice(0, 1);
  return decorHtml(soft);
};

export interface MarpMeta { code: string; level: number; levelLabel: string; title: string; theme: MarpTheme }

// ── JSON slides → Marp Markdown (thân slide là HTML thuần) ──
export function slidesToMarp(slides: SlideV2[], meta: MarpMeta): string {
  const p = PALETTE[meta.theme] || DEFAULT_PALETTE;
  const N = slides.length;
  const brandFoot = `${esc(meta.code)} · mức ${meta.level} · Trường Việt Anh`;
  const decks: string[] = [];

  slides.forEach((s, i) => {
    const lay = layoutOf(s, i, N);
    const warn = !!s.warn && lay !== "cover" && lay !== "closing";
    const cls = [lay, warn ? "warn" : ""].filter(Boolean).join(" ");
    const b: string[] = [`<!-- _class: ${cls} -->`];
    if (lay === "cover" || lay === "closing") b.push(`<!-- _paginate: false -->`);
    // BÌA & CHỐT (chỉ 2 slide, không sợ lặp) giữ trang trí đầy đủ; trang nội dung dùng bản THƯA.
    b.push(lay === "cover" || lay === "closing" ? decorHtml(s.decor) : contentDecor(s.decor, lay));

    if (lay === "cover") {
      b.push(`<div class="glow"></div>`);
      b.push(`<div class="mark">${esc(s.icon || "📘")}</div>`);
      b.push(`<div class="hd">
<div class="kick">${esc(meta.code)} · MỨC ${meta.level} — ${esc(meta.levelLabel).toUpperCase()}</div>
<div class="rule"></div>
<h1>${rmEsc(s.title)}</h1>
${s.stat ? statHtml(s.stat) : s.bullets?.length ? `<p class="lead">${s.bullets.map(rmEsc).join(" · ")}</p>` : ""}
</div>`);
      b.push(`<div class="bar">Trường Việt Anh — Xưởng Học liệu AI</div>`);
    } else if (lay === "closing") {
      b.push(`<div class="glow"></div>`);
      b.push(`<div class="hd"><div class="kick">CHỐT LẠI ĐỂ NHỚ</div><div class="rule"></div><h2>${rmEsc(s.title)}</h2></div>`);
      b.push(`<ol class="num">${s.bullets!.map((x) => `<li>${rmEsc(x)}</li>`).join("")}</ol>`);
      b.push(`<div class="bar">Trường Việt Anh — Xưởng Học liệu AI</div>`);
    } else {
      // KHÔNG dán icon mờ (.wm) mỗi slide — nhãn định hướng (kicker) đã cho biết slide làm gì rồi;
      // icon mờ góc trên phải trang nào cũng có là thứ gây cảm giác "slide máy làm".
      const lead = s.bullets?.length && lay !== "text" ? `<p class="lead">${s.bullets.map(rmEsc).join("   ·   ")}</p>` : "";
      const kick = kickerOf(s, warn);
      // Số trang bóng mờ khổ lớn — điểm nhận diện "trang sách" (biến theo slide, không phải đồ đạc lặp);
      // chỉ trên slide chữ/con-số vốn thưa, để lấp khoảng trống. Slide nhiều hình (split/visual/cards) đã đủ đầy.
      if (lay === "text" || lay === "stat" || lay === "steps") b.push(`<div class="idx">${String(i + 1).padStart(2, "0")}</div>`);
      b.push(`<div class="hd">${kick ? `<div class="kick">${esc(kick)}</div>` : ""}<div class="rule"></div><h2>${warn ? "⚠ " : ""}${rmEsc(s.title)}</h2>${lead}</div>`);

      const chartBox = s.chart ? `<figure class="chart">${chartSvg(s.chart, p, lay === "visual")}</figure>` : "";
      const tableBox = s.table ? tableHtml(s.table) : "";
      let body = "";
      if (lay === "split") {
        // cột trái: khối "đọc được" (bullets/steps/cards/stat) — cột phải: khối trực quan
        const left = s.chart && s.table
          ? tableBox
          : s.steps?.length ? stepsHtml(s.steps)
          : s.cards?.length ? cardsHtml(s.cards)
          : s.stat ? statHtml(s.stat)
          : bulletsHtml(s.bullets || []);
        const right = chartBox || tableBox;
        body = `<div class="bd split"><div class="col">${left}</div><div class="col">${right}</div></div>`;
      } else if (lay === "visual") {
        body = `<div class="bd center">${chartBox}${s.chart && s.table ? "" : tableBox}</div>`;
      } else if (lay === "cards") {
        body = `<div class="bd">${cardsHtml(s.cards!)}${s.stat ? statHtml(s.stat) : ""}</div>`;
      } else if (lay === "steps") {
        body = `<div class="bd">${stepsHtml(s.steps!)}</div>`;
      } else if (lay === "stat") {
        body = `<div class="bd center">${statHtml(s.stat!)}</div>`;
      } else {
        body = `<div class="bd text">${bulletsHtml(s.bullets || [])}</div>`;
      }
      b.push(body);
      b.push(`<div class="ft"><span>${brandFoot}</span><span class="pg">${i + 1} / ${N}</span></div>`);
    }

    // ghi chú giảng dạy → speaker notes trong PPTX. Comment phải nằm TRÊN MỘT DÒNG:
    // comment xuống dòng bị Marp bỏ qua, notes ra rỗng (chỉ còn số trang).
    if (s.notes) b.push(`<!-- ${String(s.notes).replace(/-->/g, "->").replace(/\s*\n\s*/g, " ").trim()} -->`);
    decks.push(b.join("\n"));
  });

  // front-matter DÍNH LIỀN slide 1 (chèn "---" ở đây sẽ đẻ ra một TRANG TRẮNG đầu deck)
  const front = `---\nmarp: true\ntheme: ${meta.theme}\nsize: 16:9\npaginate: false\n---\n\n`;
  return front + decks.join("\n\n---\n\n") + "\n";
}

// ── Tìm Chrome để Marp render headless ──
function findChrome(): string | undefined {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cands = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];
  return cands.find((p) => fs.existsSync(p));
}

const MARP_CLI = path.join(process.cwd(), "node_modules", "@marp-team", "marp-cli", "marp-cli.js");
const THEME_DIR = path.join(process.cwd(), "src", "lib", "templates");

// ── Ghi chú giảng dạy → speaker notes THẬT trong PPTX ──
// Marp xuất PPTX là ảnh 16:9 mỗi trang và KHÔNG mang theo presenter notes (notesSlide chỉ có số trang).
// Giáo viên cần ghi chú ngay trong PowerPoint, nên ta mở gói .pptx (zip OOXML) và chèn đoạn văn
// vào đúng placeholder body của từng notesSlide. Không có notesSlide nào (Marp đổi cách xuất) → bỏ qua,
// file vẫn hợp lệ như cũ.
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function injectNotes(pptx: Buffer, notes: (string | undefined)[]): Promise<Buffer> {
  if (!notes.some(Boolean)) return pptx;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(pptx);
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const f = zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`);
    if (!note || !f) continue;
    const xml = await f.async("string");
    // txBody của placeholder body (idx="1") — KHÔNG phải của placeholder ảnh slide
    const at = xml.indexOf('<p:ph type="body" idx="1"/>');
    if (at < 0) continue;
    const bodyPr = xml.indexOf("<a:bodyPr/>", at);
    if (bodyPr < 0) continue;
    const insert = bodyPr + "<a:bodyPr/>".length;
    const para = `<a:p><a:r><a:rPr lang="vi-VN" dirty="0"/><a:t>${xmlEsc(note)}</a:t></a:r></a:p>`;
    zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, xml.slice(0, insert) + para + xml.slice(insert));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ── Render deck → Buffer (null nếu thiếu công cụ → người gọi tự fallback) ──
export async function renderMarpDeck(
  markdown: string, theme: MarpTheme, format: MarpFormat, notes: (string | undefined)[] = [],
): Promise<Buffer | null> {
  const chrome = findChrome();
  if (!chrome || !fs.existsSync(MARP_CLI)) return null;
  const themeFile = path.join(THEME_DIR, `marp-${theme}.css`);
  if (!fs.existsSync(themeFile)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-marp-"));
  try {
    fs.writeFileSync(path.join(dir, "deck.md"), markdown, "utf-8");
    // Ghép font (Be Vietnam Pro base64) LÊN TRƯỚC theme → 1 file theme tạm, để 2 file theme gốc
    // khỏi phình 200KB base64 và vẫn sửa tay được. Thiếu file font thì render bằng font hệ thống.
    const fontsFile = path.join(THEME_DIR, "marp-fonts.css");
    const fonts = fs.existsSync(fontsFile) ? fs.readFileSync(fontsFile, "utf-8") + "\n" : "";
    const themeTmp = path.join(dir, "theme.css");
    fs.writeFileSync(themeTmp, fonts + fs.readFileSync(themeFile, "utf-8"), "utf-8");
    const out = path.join(dir, `deck.${format}`);
    // --no-stdin BẮT BUỘC: bị spawn không có TTY, marp tưởng có dữ liệu stdin nên TREO chờ mãi
    const args = [MARP_CLI, "deck.md", "--no-stdin", "--theme", themeTmp, "--html", `--${format}`, "-o", out];
    await promisify(execFile)(process.execPath, args, {
      cwd: dir,
      timeout: 90000,
      env: { ...process.env, CHROME_PATH: chrome, CHROME_NO_SANDBOX: "1" },
    });
    const buf = fs.readFileSync(out);
    return format === "pptx" ? await injectNotes(buf, notes) : buf;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
