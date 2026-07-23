import { NextRequest, NextResponse } from "next/server";
import { getDB, node, ancestors, LEVEL_LABEL, DB, Asset } from "@/lib/store";
import { readableMath, niceTicks, SLIDE_TEMPLATES } from "@/lib/shared";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { slidesToMarp, renderMarpDeck, type MarpTheme, type MarpFormat } from "@/lib/slide-marp";
import { splitMath, katexHtml, hasMath } from "@/lib/mathrender";
import { assembleVeoPrompt, STYLE_BLOCK, SCHOOL_SETTING, CHAR_BIBLE, PAUSE_MECHANISM_VI, VEO_TECH_GUIDE_VI, RELEASE_CHECKLIST_VI } from "@/lib/video-kit";

export const dynamic = "force-dynamic";

// ── Tách body phiếu học tập thành khối: bảng markdown |...| → BẢNG KẺ THẬT; dòng "[Khung vẽ: …]"
//    → KHUNG Ô LY THẬT cho học sinh vẽ; còn lại là chữ. Hết cảnh "| Tháng | 1 |" thô trên giấy. ──
// Dòng chữ = mảng SEGMENT {t, b?}: AI hay trả **đậm** markdown — Typst không parse markdown nên
// phải tách sẵn, template render strong() thật thay vì in thô dấu sao lên giấy.
type WsSeg = { t: string; b?: boolean; i?: boolean; m?: boolean }; // m: công thức LaTeX gốc → Typst render bằng #mitex
type WsBlock = { kind: "text"; lines: WsSeg[][] } | { kind: "table"; headers: string[]; rows: string[][] } | { kind: "drawbox"; caption: string } | { kind: "answerline"; count: number };
const WS_MATH = /(\\\([\s\S]*?\\\)|\$[^$\n]+?\$)/g; // \( … \) hoặc $ … $
function proseSegs(prose: string, out: WsSeg[]): void {
  readableMath(prose).split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { out.push({ t: part, b: true }); return; }
    // *nghiêng* đơn: bắt buộc ký tự đầu không phải khoảng trắng — phép nhân "5 * 3" không bị ăn nhầm
    part.split(/\*([^*\s][^*]*?)\*/g).forEach((p2, j) => { if (p2) out.push(j % 2 ? { t: p2, i: true } : { t: p2 }); });
  });
}
function mdSegs(line: string): WsSeg[] {
  const out: WsSeg[] = [];
  for (const part of line.split(WS_MATH)) {
    if (!part) continue;
    const m = part.match(/^\\\(([\s\S]*?)\\\)$/) || part.match(/^\$([^$\n]+?)\$$/);
    if (m) out.push({ t: m[1].trim(), m: true }); // đoạn toán: giữ LaTeX gốc cho mitex
    else proseSegs(part, out);
  }
  return out;
}
function wsBlocks(body: string): WsBlock[] {
  const lines = body.split("\n"); // GIỮ LaTeX thô; readableMath chỉ áp cho ô bảng/caption + prose trong mdSegs
  const isPipe = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isSep = (s: string) => /^\s*\|[\s:|\-–]+\|\s*$/.test(s);
  const isBox = (s: string) => /^\s*\[\s*khung\s*v[ẽe]?[^\]]*\]\s*$/i.test(s);
  const cells = (s: string) => s.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  // Bảng CHỈ bắt đầu theo chuẩn GFM: dòng header + NGAY DƯỚI là dòng kẻ |---|.
  // (Tránh nhầm ký hiệu trị tuyệt đối "|x| = |y|" trong câu toán thành bảng.)
  const tableStart = (k: number) => isPipe(lines[k]) && !isSep(lines[k]) && k + 1 < lines.length && isSep(lines[k + 1]);
  const out: WsBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (tableStart(i)) {
      let headers = cells(lines[i]); i += 2; // bỏ dòng kẻ
      const raw: string[][] = [];
      // GIỮ MỌI dòng |…| sau đó — kể cả "|  |  |" hay "| - | - |": đó là Ô HỌC SINH ĐIỀN, không phải dòng kẻ
      while (i < lines.length && isPipe(lines[i])) { raw.push(cells(lines[i])); i++; }
      const w = Math.max(headers.length, ...raw.map((r) => r.length), 1); // không cắt cột khi dòng rộng hơn header
      headers = Array.from({ length: w }, (_, k) => readableMath(headers[k] ?? ""));
      const rows = raw.map((r) => Array.from({ length: w }, (_, k) => {
        const c = r[k] ?? "";
        return /^[-–\s]*$/.test(c) ? "" : readableMath(c); // ô toàn gạch/trống → ô rỗng để điền
      }));
      out.push({ kind: "table", headers, rows });
      continue;
    }
    if (isBox(lines[i])) {
      out.push({ kind: "drawbox", caption: readableMath(lines[i].trim().replace(/^\[|\]$/g, "").replace(/^khung\s*v[ẽe]?\s*(biểu đồ)?\s*:?\s*/i, "").trim()) });
      i++; continue;
    }
    // dòng CHỈ toàn dấu chấm/ellipsis ("………" hoặc "....") = chỗ HỌC SINH VIẾT trả lời →
    // gộp thành khối answerline (template kẻ DÒNG để viết, đẹp hơn in thô dấu chấm).
    const isDots = (s: string) => /^[.…·\s]{3,}$/.test(s) && /[.…]/.test(s);
    const flush = (buf: string[]) => { if (buf.length) out.push({ kind: "text", lines: buf.map((l) => (l.trim() === "" ? [] : mdSegs(l))) }); };
    const buf: string[] = [];
    while (i < lines.length && !isBox(lines[i]) && !tableStart(i)) {
      if (isDots(lines[i])) {
        flush(buf); buf.length = 0;
        let n = 0; while (i < lines.length && isDots(lines[i])) { n++; i++; }
        out.push({ kind: "answerline", count: Math.min(n, 8) });
        continue;
      }
      buf.push(lines[i]); i++;
    }
    flush(buf);
  }
  return out;
}

// ── Worker Typst (out-of-process): đổ JSON vào template .typ → PDF in đẹp <1s ──
// extra: file phụ đặt cạnh main.typ (vd chart0.svg để template nhúng bằng image())
const TYPST_BIN = process.env.TYPST_BIN
  || path.join(process.cwd(), "workers", "typst", process.platform === "win32" ? "typst.exe" : "typst");
async function typstPdf(template: string, data: unknown, extra?: Record<string, string>): Promise<Buffer | null> {
  if (!fs.existsSync(TYPST_BIN)) return null; // chưa cài binary → người gọi tự fallback DOCX
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-typst-"));
  try {
    fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(data));
    for (const [name, body] of Object.entries(extra || {})) fs.writeFileSync(path.join(dir, name), body);
    fs.copyFileSync(path.join(process.cwd(), "src", "lib", "templates", template), path.join(dir, "main.typ"));
    await promisify(execFile)(TYPST_BIN, ["compile", "main.typ", "out.pdf"], { cwd: dir, timeout: 20000 });
    return fs.readFileSync(path.join(dir, "out.pdf"));
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ══ HTML TƯƠNG TÁC TỰ CHỨA (variant=html): mở là chạy — gửi Zalo/Drive, nhúng LMS, không cần nền tảng ══
const hEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonEmbed = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c"); // chống </script> phá tag

// HTML-cho-công-thức: đoạn toán trong \(…\)/$…$ → KaTeX thật; phần chữ → escape + readableMath
// (giữ ký hiệu trần Unicode). Dùng cho bản xuất HTML tự chứa thay cho hEsc(readableMath(x)).
const mh = (s: unknown) => splitMath(String(s ?? "")).map((seg) => seg.math ? katexHtml(seg.value, seg.display) : hEsc(readableMath(seg.value))).join("");
// CSS KaTeX + font woff2 nhúng base64 (sinh bởi scripts/gen-katex-css.ts) → file HTML hiện công thức OFFLINE.
let _katexCss: string | null = null;
const katexCss = (): string => {
  if (_katexCss === null) {
    try { _katexCss = fs.readFileSync(path.join(process.cwd(), "src", "lib", "templates", "katex-inline.css"), "utf8"); }
    catch { _katexCss = ""; }
  }
  return _katexCss;
};
function htmlShell(title: string, sub: string, body: string, script = "", extraCss = "", math = false): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${hEsc(title)}</title>
<style>
${math ? katexCss() + "\n.katex{font-size:1.02em}\n" : ""}:root{--brand:#1E4D38;--brand2:#2E6B4F;--brass:#B08A3C;--mist:#EFF5EF;--ink:#26332B;--muted:#6B7A6E;--line:#DDE5DC;--warnbg:#FAF6EC;--warnln:#E3D3AD}
*{box-sizing:border-box;margin:0}
body{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;background:#F4F7F2;color:var(--ink);-webkit-tap-highlight-color:transparent}
.hd{background:var(--brand);color:#fff;padding:14px 18px}
.hd b{font-size:17px}.hd small{display:block;color:#9DBBA8;margin-top:2px;font-weight:400}
.wrap{max-width:880px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:12px}
.btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
.btn.p{background:var(--brand);border-color:var(--brand);color:#fff}
.btn:disabled{opacity:.45;cursor:default}
.ft{color:var(--muted);font-size:11.5px;text-align:center;padding:14px}
${extraCss}
</style></head><body>
<div class="hd"><b>${hEsc(title)}</b><small>${hEsc(sub)} · Trường Việt Anh — Xưởng Học liệu AI</small></div>
${body}
<div class="ft">Học liệu Trường Việt Anh · file tự chạy, không cần Internet</div>
${script ? `<script>${script}</script>` : ""}
</body></html>`;
}
// Biểu đồ SVG server-side cho HTML deck (cùng số học với ChartSvg trên web app)
function chartSvgStr(chart: SlideChart): string {
  const W = 720, H = 380, P = { l: 62, r: 18, t: 32, b: chart.xLabel ? 58 : 40 };
  const all = chart.series.flatMap((s) => s.values);
  // trục theo "vạch đẹp" (bước 1/2/5×10ⁿ) — cùng số học với ChartSvg trên web app
  const { ticks, lo: mn, hi: max } = niceTicks(Math.min(0, ...all), Math.max(...all, 1));
  const n = chart.categories.length, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = (k: number) => P.l + (n > 1 ? (k * iw) / (n - 1) : iw / 2);
  const Y = (v: number) => P.t + ih - ((v - mn) * ih) / (max - mn || 1);
  const y0 = Y(0);
  const colors = ["#1E4D38", "#B08A3C", "#2E6B4F"];
  const bw = Math.min(46, (iw / n) * 0.6 / chart.series.length);
  // width/height tường minh cho usvg (Typst nhúng qua image()); browser ưu tiên style nên HTML vẫn co giãn
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif" style="width:100%;height:auto">`;
  for (const t of ticks) {
    out += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#E7EDE8"/><text x="${P.l - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="12" fill="#6B7A6E">${Number.isInteger(t) ? t : t.toFixed(1)}</text>`;
  }
  out += `<line x1="${P.l}" x2="${W - P.r}" y1="${y0}" y2="${y0}" stroke="#9AAA9E" stroke-width="1.4"/><line x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${Y(mn)}" stroke="#9AAA9E" stroke-width="1.4"/>`;
  chart.categories.forEach((cat, k) => { out += `<text x="${chart.type === "bar" ? P.l + (k + 0.5) * (iw / n) : X(k)}" y="${H - P.b + 20}" text-anchor="middle" font-size="12.5" fill="#26332B">${hEsc(readableMath(cat))}</text>`; });
  if (chart.xLabel) out += `<text x="${P.l + iw / 2}" y="${H - 8}" text-anchor="middle" font-size="12.5" fill="#6B7A6E">${hEsc(readableMath(chart.xLabel))}</text>`;
  if (chart.yLabel) out += `<text x="14" y="${P.t + ih / 2}" text-anchor="middle" font-size="12.5" fill="#6B7A6E" transform="rotate(-90 14 ${P.t + ih / 2})">${hEsc(readableMath(chart.yLabel))}</text>`;
  chart.series.forEach((se, si) => {
    const col = colors[si % 3];
    if (chart.type === "bar") {
      se.values.forEach((v, k) => {
        const gx = P.l + (k + 0.5) * (iw / n) - (bw * chart.series.length) / 2 + si * bw;
        out += `<rect x="${gx}" y="${Math.min(Y(v), y0)}" width="${bw - 3}" height="${Math.max(1, Math.abs(y0 - Y(v)))}" rx="3" fill="${col}"/><text x="${gx + (bw - 3) / 2}" y="${v >= 0 ? Y(v) - 6 : Y(v) + 15}" text-anchor="middle" font-size="12" font-weight="600" fill="#26332B">${v}</text>`;
      });
    } else {
      out += `<polyline points="${se.values.map((v, k) => `${X(k)},${Y(v)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      se.values.forEach((v, k) => { out += `<circle cx="${X(k)}" cy="${Y(v)}" r="5" fill="#fff" stroke="${col}" stroke-width="2.6"/><text x="${X(k)}" y="${Y(v) - 11}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#26332B">${v}</text>`; });
    }
  });
  if (chart.series.length > 1) {
    let lx = P.l;
    chart.series.forEach((se, si) => {
      const name = se.name.length > 22 ? se.name.slice(0, 21) + "…" : se.name;
      out += `<rect x="${lx}" y="4" width="12" height="12" rx="3" fill="${colors[si % 3]}"/><text x="${lx + 17}" y="14" font-size="12" fill="#26332B">${hEsc(readableMath(name))}</text>`;
      lx += 27 + name.length * 6.6;
    });
  }
  return out + "</svg>";
}

interface SlideChart { type: "line" | "bar"; categories: string[]; series: { name: string; values: number[] }[]; xLabel?: string; yLabel?: string }
interface SlideTable { headers: string[]; rows: string[][] }
interface SlideCard { icon?: string; title: string; text?: string }
interface DecorEl { kind: "blob" | "ring" | "sticker" | "chip" | "arrow" | "line"; x: number; y: number; w?: number; h?: number; size?: number; text?: string; color?: string; opacity?: number; x2?: number; y2?: number; front?: boolean }
interface SlideV2 { title: string; icon?: string; bullets?: string[]; steps?: string[]; cards?: SlideCard[]; stat?: { value: string; label: string }; table?: SlideTable; chart?: SlideChart; warn?: boolean; notes?: string; decor?: DecorEl[] }
interface SlideContent { slides: SlideV2[] }
interface SectionContent { sections: { heading: string; body: string; chart?: SlideChart }[]; answers?: string[] }
interface QuizContent { questions: { type: string; q: string; options?: string[]; answer: unknown; explanation?: string; dok?: number; misconceptionRef?: string }[] }
interface MindmapContent { markdown: string; chart?: SlideChart }
interface PodcastContent { script: { speaker: string; text: string; mood?: string }[] }
interface VideoScene { beat?: string; role?: "veo" | "avatar" | "graphics"; setting?: string; visual: string; dialogue?: { speaker: string; line: string; action?: string }[]; onScreenText?: string; animation?: string; veoAction?: string; veoCast?: string[]; mucTieu?: string; narration?: string; durationSec?: number }
interface VideoContent { videoTitle?: string; logline?: string; characters?: { name: string; role?: string }[]; scenes: VideoScene[]; durationSec?: number; style?: string }

// ══ PODCAST → MP3 giọng Việt THẬT (edge-tts, miễn phí) ══
// Dùng chung cho variant=mp3, cho trình phát trong app, và để NHÚNG vào bản HTML tự chứa.
// KHÔNG bao giờ để trình duyệt tự đọc (speechSynthesis): máy Windows thường chỉ cài MỘT giọng vi-VN
// nên hai vai rơi vào cùng một giọng — cô nghe ra nam, trò nghe ra nữ.
type Role = { voice: "f" | "m"; kind: "adult" | "kid" };
// edge-tts tiếng Việt chỉ có 2 giọng: HoaiMy (nữ) · NamMinh (nam). Tách vai theo GIỚI:
//   cô → nữ người lớn · thầy → NAM người lớn (trước đây mọi giáo viên đều lấy giọng nữ)
//   học sinh → mặc định NAM (nhân vật Bin), chỉ đổi sang nữ khi tên nữ rõ ràng
export const roleOf = (sp: string): Role => {
  const s = sp.toLowerCase();
  if (/cô|giáo viên|^gv/.test(s)) return { voice: "f", kind: "adult" };
  if (/thầy/.test(s)) return { voice: "m", kind: "adult" };
  const girl = /\b(lan|mai|hoa|linh|hà|thảo|ngọc|my|chi|trang|nhi|vy|hân|quỳnh|thu)\b/.test(s);
  return { voice: girl ? "f" : "m", kind: "kid" };
};
// mood từng câu → xê dịch rate/pitch QUANH baseline của vai: cả tập có nhịp cảm xúc, không đều đều.
// Xê dịch giữ NHỎ để không đổi "người" giữa chừng. Học sinh nam từng bị đẩy +22Hz → nghe như bé gái;
// hạ về +12Hz: vẫn trẻ trung nhưng rõ ràng là NAM.
const voiceArgs = (r: Role, mood?: string): string[] => {
  const m = (mood || "").toLowerCase();
  const nudge = /ngạc|wow/.test(m) ? 2 : /vui/.test(m) ? 1 : /trầm|tram/.test(m) ? -2 : 0;
  const base = r.kind === "adult" ? { rate: -4, pitch: r.voice === "m" ? -6 : -2 } : { rate: 6, pitch: 12 };
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return ["--voice", r.voice === "f" ? "vi-VN-HoaiMyNeural" : "vi-VN-NamMinhNeural",
    `--rate=${sign(base.rate + nudge * 3)}%`, `--pitch=${sign(base.pitch + nudge * 4)}Hz`];
};
// "7/1" → "7 phần 1", "p/q" → "p trên q", "∈" → "thuộc"… — TTS đọc trơn thay vì đánh vần ký hiệu
const spokenText = (s: string) => readableMath(s)
  .replace(/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)/g, "$1 phần $2")
  .replace(/\b([a-zA-Z])\s*\/\s*([a-zA-Z])\b/g, "$1 trên $2")
  .replace(/∈/g, " thuộc ").replace(/∉/g, " không thuộc ").replace(/⊂/g, " là tập con của ")
  .replace(/ℚ/g, " Q ").replace(/ℤ/g, " Z ").replace(/ℕ/g, " N ").replace(/ℝ/g, " R ")
  .replace(/≠/g, " khác ").replace(/≤/g, " nhỏ hơn hoặc bằng ").replace(/≥/g, " lớn hơn hoặc bằng ")
  .replace(/×/g, " nhân ").replace(/÷/g, " chia ").replace(/√/g, " căn ").replace(/%/g, " phần trăm").replace(/°C/g, " độ C")
  .replace(/\s=\s/g, " bằng ").replace(/\s\+\s/g, " cộng ").replace(/\s[−-]\s/g, " trừ ")
  .replace(/\s{2,}/g, " ").trim();

async function podcastMp3(script: { speaker: string; text: string; mood?: string }[]): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "va-tts-"));
  // edge-tts thi thoảng trả NoAudioReceived vu vơ (dịch vụ Microsoft chập chờn) → thử lại tối đa 3 lần/câu
  const ttsLine = async (args: string[], text: string, out: string) => {
    let last: unknown;
    for (let t = 0; t < 3; t++) {
      try {
        await promisify(execFile)("python", ["-m", "edge_tts", ...args, "--text", text, "--write-media", out], { timeout: 45000 });
        if (fs.existsSync(out) && fs.statSync(out).size > 0) return;
      } catch (e) { last = e; }
      await new Promise((r) => setTimeout(r, 700 * (t + 1)));
    }
    throw last instanceof Error ? last : new Error("edge-tts không trả audio sau 3 lần thử");
  };
  try {
    const lineFiles: string[] = [];
    for (const [i, line] of script.entries()) {
      const out = path.join(dir, `p${i}.mp3`);
      await ttsLine(voiceArgs(roleOf(line.speaker), line.mood), spokenText(line.text), out);
      lineFiles.push(out);
    }
    // ── HẬU KỲ (có ffmpeg trong workers/): nhạc hiệu mở/đóng + nghỉ 400ms giữa lượt thoại
    //    + loudnorm chuẩn podcast (-16 LUFS). Thiếu ffmpeg/jingle → ghép thẳng (cùng codec, phát được). ──
    const FF = process.env.FFMPEG_BIN
      || path.join(process.cwd(), "workers", "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    const jgl = (f: string) => path.join(process.cwd(), "workers", "podcast", f);
    if (fs.existsSync(FF) && ["intro.mp3", "outro.mp3", "sil400.mp3", "sil700.mp3"].every((f) => fs.existsSync(jgl(f)))) {
      const seq = [jgl("intro.mp3"), jgl("sil400.mp3")];
      lineFiles.forEach((f, i) => { seq.push(f); if (i < lineFiles.length - 1) seq.push(jgl("sil400.mp3")); });
      seq.push(jgl("sil700.mp3"), jgl("outro.mp3"));
      const list = path.join(dir, "list.txt");
      fs.writeFileSync(list, seq.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
      const outMp3 = path.join(dir, "out.mp3");
      await promisify(execFile)(FF, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1", "-b:a", "48k", outMp3], { timeout: 120000 });
      return fs.readFileSync(outMp3);
    }
    return Buffer.concat(lineFiles.map((f) => fs.readFileSync(f)));
  } catch (e) {
    throw new Error("TTS thất bại — máy chủ cần Python + gói edge-tts (pip install edge-tts) và Internet. Chi tiết: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── variant=html: 4 định dạng TƯƠNG TÁC tự chứa (quiz tự chấm, luyện thẻ, trình chiếu, nghe podcast) ──
function buildHtmlVariant(asset: Asset, pkg: { level: number }, atom: { title: string; code: string }, audioB64?: string): string | null {
  const rm = readableMath;
  const sub = `${atom.code} · mức ${pkg.level} (${LEVEL_LABEL[pkg.level]})`;

  if (asset.format === "quiz") {
    const c = asset.content as QuizContent;
    const needMath = hasMath(JSON.stringify(c.questions));
    const qs = c.questions.map((q, i) => {
      const opts = q.type === "tf" ? ["Đúng", "Sai"] : (q.options || []);
      return `<div class="card q" data-i="${i}"><p class="qt"><b>Câu ${i + 1}.</b> ${mh(q.q)}</p>
${q.type === "fill"
  ? `<input class="fi" placeholder="Điền câu trả lời…"/>`
  : opts.map((o, j) => `<label class="op"><input type="radio" name="q${i}" value="${q.type === "tf" ? (j === 0 ? "true" : "false") : j}"/><span>${mh(o)}</span></label>`).join("")}
<div class="ex" hidden>💡 ${mh(q.explanation || "")}${q.type === "fill" ? ` <b>(Đáp án: ${mh(String(q.answer))})</b>` : ""}</div>
${q.misconceptionRef ? `<div class="mi" hidden>⚠ Bẫy thường gặp: ${mh(q.misconceptionRef)}</div>` : ""}</div>`;
    }).join("");
    const key = c.questions.map((q) => ({ t: q.type, a: q.answer }));
    return htmlShell(`Quiz: ${rm(atom.title)}`, sub,
      `<div class="wrap"><div id="score" class="card" style="display:none"></div>${qs}
<div style="display:flex;gap:10px;justify-content:center;padding:6px 0 18px"><button id="go" class="btn p">✓ Chấm bài</button><button id="re" class="btn" style="display:none">↺ Làm lại</button></div></div>`,
      `const KEY=${jsonEmbed(key)};
const norm=s=>String(s??"").trim().toLowerCase().replace(/\\s+/g," ");
document.getElementById("go").onclick=()=>{let ok=0;
KEY.forEach((k,i)=>{const el=document.querySelector('.q[data-i="'+i+'"]');let good=false;
if(k.t==="fill"){const v=norm(el.querySelector(".fi").value);const a=norm(k.a);good=!!v&&(v===a||a.includes(v)||v.includes(a));el.querySelector(".fi").disabled=true}
else{const sel=el.querySelector("input:checked");const v=sel?sel.value:null;good=k.t==="tf"?v===String(k.a===true):Number(v)===Number(k.a);
el.querySelectorAll("input").forEach(x=>x.disabled=true);
el.querySelectorAll(".op").forEach((lab)=>{const inp=lab.querySelector("input");const isKey=k.t==="tf"?inp.value===String(k.a===true):Number(inp.value)===Number(k.a);
if(isKey)lab.classList.add("ok");else if(inp.checked)lab.classList.add("bad")})}
if(good)ok++;el.classList.add(good?"right":"wrong");el.querySelectorAll(".ex,.mi").forEach(x=>x.hidden=false)});
const s=document.getElementById("score");s.style.display="block";
s.innerHTML='<b style="font-size:20px">Kết quả: '+ok+"/"+KEY.length+' câu đúng</b> '+(ok===KEY.length?"🏆 Tuyệt vời!":ok>=KEY.length/2?"👍 Khá lắm, xem lại câu sai nhé!":"💪 Xem giải thích rồi thử lại nhé!");
document.getElementById("go").style.display="none";document.getElementById("re").style.display="";window.scrollTo({top:0,behavior:"smooth"})};
document.getElementById("re").onclick=()=>location.reload();`,
      `.qt{margin-bottom:10px;line-height:1.5}
.op{display:flex;gap:9px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin:6px 0;cursor:pointer;font-size:14.5px}
.op.ok{border-color:#2E9C6A;background:#EFF7F1}.op.bad{border-color:#C65A44;background:#FBF1EF}
.fi{width:100%;max-width:320px;border:1px solid #B8C4BA;border-radius:9px;padding:9px 12px;font-size:15px}
.ex{background:#EEF4FA;border-radius:9px;padding:9px 12px;margin-top:9px;font-size:13.5px}
.mi{background:var(--warnbg);border:1px solid var(--warnln);border-radius:9px;padding:9px 12px;margin-top:7px;font-size:13.5px}
.q.right .qt::after{content:" ✓";color:#2E9C6A}.q.wrong .qt::after{content:" ✗";color:#C65A44}`, needMath);
  }

  if (asset.format === "flashcard") {
    const c = asset.content as { cards: { front: string; back: string }[]; chart?: SlideChart };
    const needMath = hasMath(JSON.stringify(c.cards));
    const cards = c.cards.map((x) => ({ f: mh(x.front), b: mh(x.back) }));
    // chart đính kèm → nút 📊 mở bảng số liệu tham khảo (thẻ vẫn tự đứng, chart chỉ hỗ trợ)
    const chartBits = c.chart
      ? `<div style="text-align:center;margin-bottom:10px"><button class="btn" onclick="document.getElementById('cbox').hidden=!document.getElementById('cbox').hidden" style="font-size:12.5px;padding:6px 12px">📊 Số liệu tham khảo</button></div>
<div id="cbox" class="card" hidden><p style="font-weight:700;font-size:10.5px;letter-spacing:.12em;color:var(--brass);margin-bottom:6px">SỐ LIỆU THAM KHẢO CHO BỘ THẺ</p>${chartSvgStr(c.chart)}</div>`
      : "";
    return htmlShell(`Luyện thẻ: ${rm(atom.title)}`, sub,
      `<div class="wrap" style="max-width:560px"><p id="prog" style="text-align:center;color:var(--muted);font-size:13px;margin-bottom:10px"></p>
${chartBits}<div id="fc" class="fc"><div class="inner"><div class="face f"></div><div class="face b"></div></div></div>
<p style="text-align:center;color:var(--muted);font-size:12.5px;margin:10px 0">Chạm thẻ để lật</p>
<div id="acts" style="display:flex;gap:10px;justify-content:center"><button id="no" class="btn">🔁 Chưa nhớ</button><button id="yes" class="btn p">✓ Đã nhớ</button></div>
<div id="done" style="display:none;text-align:center" class="card"><p style="font-size:34px">🏆</p><p style="font-weight:700;margin:6px 0">Em đã thuộc cả bộ thẻ!</p><button id="again" class="btn p" style="margin-top:8px">↺ Học lại từ đầu</button></div></div>`,
      `const CARDS=${jsonEmbed(cards)};let queue=CARDS.map((_,i)=>i),idx=0,total=CARDS.length,doneCount=0;
const fc=document.getElementById("fc"),f=document.querySelector(".face.f"),b=document.querySelector(".face.b");
function show(){if(!queue.length){fc.style.display="none";document.getElementById("acts").style.display="none";document.getElementById("done").style.display="block";document.getElementById("prog").textContent="Hoàn thành "+total+" thẻ";return}
const c=CARDS[queue[0]];fc.classList.remove("flip");f.innerHTML=c.f;b.innerHTML=c.b;
document.getElementById("prog").textContent="Đã nhớ "+doneCount+"/"+total+" · còn "+queue.length+" thẻ"}
fc.onclick=()=>fc.classList.toggle("flip");
document.getElementById("yes").onclick=()=>{doneCount++;queue.shift();show()};
document.getElementById("no").onclick=()=>{queue.push(queue.shift());show()};
document.getElementById("again").onclick=()=>{queue=CARDS.map((_,i)=>i);doneCount=0;fc.style.display="";document.getElementById("acts").style.display="flex";document.getElementById("done").style.display="none";show()};
show();`,
      `.fc{perspective:1200px;height:300px;cursor:pointer}
.inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .5s}
.fc.flip .inner{transform:rotateY(180deg)}
.face{position:absolute;inset:0;backface-visibility:hidden;border-radius:16px;display:flex;align-items:center;justify-content:center;padding:26px;text-align:center;white-space:pre-wrap;overflow:auto}
.face.f{background:#fff;border:1.5px solid var(--brand);font-weight:700;font-size:18px}
.face.b{background:var(--brand);color:#fff;transform:rotateY(180deg);font-size:15.5px;line-height:1.55}`, needMath);
  }

  if (asset.format === "slide") {
    const c = asset.content as SlideContent;
    const N = c.slides.length;
    const needMath = hasMath(JSON.stringify(c.slides));
    const sl = c.slides.map((s, i) => {
      const warn = s.warn === true || /cẩn thận|lưu ý|nhầm/i.test(s.title);
      if (i === 0) return `<section class="sl cover"><div class="brs"></div><h1>${mh(s.title)}</h1>
${s.stat ? `<p class="bignum">${mh(s.stat.value)}</p><p class="statlb">${mh(s.stat.label)}</p>` : s.bullets?.length ? `<p class="sub">${s.bullets.map((x) => mh(x)).join("    ·    ")}</p>` : ""}
${s.icon ? `<div class="cicon">${s.icon}</div>` : ""}<p class="cft">Trường Việt Anh — Xưởng Học liệu AI · ${hEsc(sub)}</p></section>`;
      let body = "";
      if (s.cards?.length) body = `<div class="cds n${Math.min(s.cards.length, 3)}">${s.cards.map((cd, j) => `<div class="cd ${j % 2 ? "w" : "g"}"><b>${cd.icon ? cd.icon + " " : ""}${mh(cd.title)}</b>${cd.text ? `<p>${mh(cd.text)}</p>` : ""}</div>`).join("")}</div>`;
      else if (s.stat) body = `<div class="statwrap"><p class="bignum2">${mh(s.stat.value)}</p><p class="statlb2">${mh(s.stat.label)}</p></div>`;
      else if (s.steps?.length) body = `<ol class="steps">${s.steps.map((st, j) => `<li><span class="bd ${j === s.steps!.length - 1 ? "br" : ""}">${j + 1}</span>${mh(st.replace(/^[①-⑨]\s*/, ""))}</li>`).join("")}</ol>`;
      if (s.table) body += `<table class="tb"><tr>${s.table.headers.map((h) => `<th>${mh(h)}</th>`).join("")}</tr>${s.table.rows.map((r) => `<tr>${r.map((x) => `<td>${mh(x)}</td>`).join("")}</tr>`).join("")}</table>`;
      if (s.chart) body += `<div class="ch">${chartSvgStr(s.chart)}</div>`;
      if (!body && s.bullets?.length) body = `<ul class="bl">${s.bullets.map((x) => `<li>${mh(x)}</li>`).join("")}</ul>`;
      else if (body && s.bullets?.length && !s.stat) body = `<p class="cap">${s.bullets.map((x) => mh(x)).join("   ·   ")}</p>` + body;
      return `<section class="sl ct ${warn ? "warn" : ""}"><div class="tbar"></div><header><h2>${warn ? "⚠ " : ""}${mh(s.title)}</h2>${s.icon ? `<span class="ic">${s.icon}</span>` : ""}</header><div class="body">${body}</div><footer><span>${hEsc(sub)} · Trường Việt Anh</span><span>${i + 1} / ${N}</span></footer></section>`;
    }).join("");
    return htmlShell(`Slide: ${rm(atom.title)}`, sub,
      `<div class="wrap" style="max-width:1020px"><div id="deck">${sl}</div>
<div style="display:flex;gap:10px;justify-content:center;align-items:center;padding:12px"><button id="pv" class="btn">← Trước</button><span id="pg" style="font-size:13.5px;color:var(--muted)"></span><button id="nx" class="btn p">Sau →</button></div></div>`,
      `let i=0;const S=document.querySelectorAll(".sl"),N=S.length;
function go(k){i=Math.max(0,Math.min(N-1,k));S.forEach((s,j)=>s.style.display=j===i?"flex":"none");
document.getElementById("pg").textContent=(i+1)+" / "+N;document.getElementById("pv").disabled=i===0;document.getElementById("nx").disabled=i===N-1}
document.getElementById("pv").onclick=()=>go(i-1);document.getElementById("nx").onclick=()=>go(i+1);
addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key===" ")go(i+1);if(e.key==="ArrowLeft")go(i-1)});
let tx=null;addEventListener("touchstart",e=>tx=e.touches[0].clientX);
addEventListener("touchend",e=>{if(tx==null)return;const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50)go(i+(dx<0?1:-1));tx=null});
go(0);`,
      `.sl{aspect-ratio:16/9;border-radius:14px;border:1px solid var(--line);background:#fff;display:none;flex-direction:column;overflow:hidden;position:relative}
.cover{background:var(--brand);color:#fff;justify-content:center;padding:7% 8%}
.brs{width:64px;height:5px;background:var(--brass);border-radius:3px;margin-bottom:18px}
.cover h1{font-size:clamp(20px,3.6vw,38px);max-width:75%}
.bignum{color:#E8C87A;font-size:clamp(34px,6vw,62px);font-weight:800;margin-top:14px}
.statlb{color:#DCE8DF;margin-top:6px;font-size:clamp(12px,1.6vw,17px)}
.sub{color:#DCE8DF;margin-top:14px}
.cicon{position:absolute;right:6%;top:10%;width:14%;aspect-ratio:1;background:rgba(255,255,255,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:clamp(26px,4.5vw,52px)}
.cft{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.16);padding:8px 8%;font-size:clamp(9px,1.2vw,12px);color:#9DBBA8}
.ct{padding:4.5% 5.5% 3%}
.tbar{position:absolute;top:0;left:0;right:0;height:8px;background:var(--brand)}
.ct.warn .tbar{background:var(--brass)}
.ct header{display:flex;justify-content:space-between;align-items:center;gap:12px}
.ct h2{color:var(--brand);font-size:clamp(17px,2.6vw,27px);border-bottom:4px solid var(--brass);padding-bottom:8px}
.ct.warn h2{color:#8a6a20;border-color:var(--brand)}
.ct .ic{width:clamp(34px,5vw,56px);aspect-ratio:1;background:var(--mist);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:clamp(18px,2.8vw,30px);flex-shrink:0}
.ct.warn .ic{background:var(--warnbg)}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;gap:8px}
.bl{list-style:none;display:flex;flex-direction:column;gap:clamp(7px,1.4vw,15px);font-size:clamp(13px,1.9vw,19px);max-width:92%}
.bl li::before{content:"●";color:var(--brass);font-size:.6em;margin-right:10px;vertical-align:2px}
.cap{color:var(--muted);font-style:italic;font-size:clamp(10.5px,1.4vw,13.5px)}
.steps{list-style:none;display:flex;flex-direction:column;gap:clamp(6px,1.2vw,12px);font-size:clamp(12.5px,1.8vw,18px)}
.steps li{display:flex;gap:12px;align-items:center}
.bd{width:clamp(22px,2.8vw,30px);aspect-ratio:1;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:.85em;flex-shrink:0}
.bd.br{background:var(--brass)}
.cds{display:grid;gap:clamp(8px,1.4vw,14px)}.cds.n2{grid-template-columns:1fr 1fr}.cds.n3{grid-template-columns:1fr 1fr 1fr}
.cd{border-radius:12px;padding:clamp(9px,1.6vw,16px);font-size:clamp(11.5px,1.6vw,15px)}
.cd b{color:var(--brand);display:block;margin-bottom:4px}
.cd.g{background:var(--mist);border:1px solid #CFE0D2}.cd.w{background:var(--warnbg);border:1px solid var(--warnln)}
.tb{border-collapse:collapse;margin:0 auto;font-size:clamp(11px,1.6vw,15px)}
.tb th{background:var(--brand);color:#fff;padding:6px 14px;border:1px solid #C9D4CB}
.tb td{padding:6px 14px;border:1px solid #C9D4CB;text-align:center}
.ch{max-width:88%;margin:0 auto;width:100%}
.bignum2{font-size:clamp(40px,7vw,76px);font-weight:800;color:var(--brand)}
.statlb2{color:var(--muted);font-size:clamp(13px,2vw,19px);margin-top:6px}
.statwrap{text-align:center}
.ct footer{display:flex;justify-content:space-between;color:var(--muted);font-size:clamp(9px,1.15vw,11.5px)}`, needMath);
  }

  if (asset.format === "podcast") {
    const c = asset.content as PodcastContent;
    const lines = c.script.map((l) => ({ sp: l.speaker, tx: rm(l.text), t: roleOf(l.speaker).kind === "adult" }));
    const bubbles = lines.map((l, i) => `<div class="bb ${l.t ? "t" : "s"}" data-i="${i}"><span class="av">${l.t ? "👩‍🏫" : "🧒"}</span><div><p class="nm">${hEsc(l.sp)}</p><p>${hEsc(l.tx)}</p></div></div>`).join("");
    // MP3 THẬT nhúng thẳng vào file (edge-tts): mở HTML ở bất kỳ máy nào cũng nghe đúng cô nữ / trò nam.
    // Không nhúng được (máy chủ thiếu edge-tts) → mới đành nhờ giọng đọc của thiết bị.
    const player = audioB64
      ? `<audio controls preload="none" style="width:100%" src="data:audio/mpeg;base64,${audioB64}"></audio>
<p style="font-size:12px;color:#9DBBA8;margin-top:8px">Giọng Việt thật — cô giọng nữ · trò giọng nam. Nghe được cả khi không có mạng.</p>`
      : `<div style="display:flex;gap:12px;align-items:center">
<button id="pl" class="btn" style="border-radius:50%;width:52px;height:52px;justify-content:center;font-size:19px">▶</button>
<div><b>Đọc bằng giọng của thiết bị</b><p style="font-size:12px;color:#9DBBA8;margin-top:3px">Máy chủ chưa dựng được MP3 — giọng phụ thuộc giọng cài trên máy này.</p></div></div>`;
    return htmlShell(`Podcast: ${rm(atom.title)}`, sub,
      `<div class="wrap" style="max-width:640px"><div class="card" style="background:var(--brand);border-color:var(--brand);color:#fff">${player}</div>
${bubbles}</div>`,
      audioB64 ? "" : `const L=${jsonEmbed(lines)};let playing=false,idx=0;
const btn=document.getElementById("pl");
function pick(){const vs=speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith("vi"));
const f=vs.find(v=>/hoaimy|female|nữ/i.test(v.name))||vs[0]||null;
const m=vs.find(v=>v!==f&&/namminh|male|nam/i.test(v.name))||vs.find(v=>v!==f)||f;return{f,m}}
function hl(i){document.querySelectorAll(".bb").forEach(b=>b.classList.remove("on"));
if(i>=0){const el=document.querySelector('.bb[data-i="'+i+'"]');if(el){el.classList.add("on");el.scrollIntoView({block:"center",behavior:"smooth"})}}}
function next(){if(!playing||idx>=L.length){stop();return}
const l=L[idx];hl(idx);const{f,m}=pick();const u=new SpeechSynthesisUtterance(l.tx);
const v=l.t?f:m;if(v)u.voice=v;u.lang="vi-VN";u.pitch=l.t?1:1.28;u.rate=l.t?.98:1.08;
u.onend=()=>{idx++;next()};speechSynthesis.speak(u)}
function stop(){playing=false;speechSynthesis.cancel();btn.textContent="▶";hl(-1);idx=0}
btn.onclick=()=>{if(playing){stop()}else{playing=true;btn.textContent="■";speechSynthesis.cancel();next()}};`,
      `.bb{display:flex;gap:10px;margin:10px 0;align-items:flex-start}
.bb.s{flex-direction:row-reverse}
.av{width:38px;height:38px;border-radius:50%;background:var(--mist);display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.bb.s .av{background:var(--warnbg)}
.bb>div{background:#fff;border:1px solid var(--line);border-radius:12px;padding:9px 13px;max-width:78%}
.bb.s>div{background:#FBF8EF}
.nm{font-size:11px;font-weight:700;color:var(--muted);margin-bottom:3px}
.bb p:last-child{font-size:14.5px;line-height:1.55}
.bb.on>div{border-color:var(--brand);box-shadow:0 0 0 2px #1E4D3822}`);
  }

  return null;
}

// ── Dựng file xuất cho MỘT asset — dùng chung cho tải lẻ (GET assetId), tải ZIP hàng loạt (GET ids)
//    và Đẩy sang Gia sư (lib/tutor-push upload file này lên bucket tutor) ──
export interface Built { data: Buffer | string; mime: string; ext: string; base: string }
export async function buildExport(db: DB, asset: Asset, variant: string | null): Promise<Built> {
  const pkg = db.packages.find((p) => p.id === asset.packageId)!;
  const atom = node(db, pkg.atomId)!;
  const base = `${atom.code}_muc${pkg.level}_${asset.format}`;
  const title = `${atom.title} — mức ${LEVEL_LABEL[pkg.level]}`;
  const file = (data: Buffer | string, mime: string, ext: string): Built => ({ data, mime, ext, base });

  // ── variant=html: bản TƯƠNG TÁC tự chứa (quiz/flashcard/slide/podcast) — mở là chạy ──
  if (variant === "html") {
    // podcast: dựng MP3 thật rồi NHÚNG vào file. Máy chủ thiếu edge-tts → vẫn xuất được HTML,
    // chỉ là phải nhờ giọng đọc của thiết bị (kém hơn) thay vì hỏng cả bản xuất.
    let audioB64: string | undefined;
    if (asset.format === "podcast") {
      try { audioB64 = (await podcastMp3((asset.content as PodcastContent).script)).toString("base64"); }
      catch { audioB64 = undefined; }
    }
    const h = buildHtmlVariant(asset, pkg, atom, audioB64);
    if (h) return file(h, "text/html; charset=utf-8", "html");
  }

  {
    if (asset.format === "slide") {
      // ── ĐƯỜNG MỚI (Marp): thiết kế web thật (theme CSS) → ảnh 16:9 nhúng slide → đẹp như trang web.
      //    Thiếu Chrome/marp-cli/theme → renderMarpDeck trả null → tự rơi xuống pptxgenjs bên dưới (an toàn). ──
      {
        const cc = asset.content as SlideContent;
        if (cc.slides?.length) {
          // variant mang id mẫu, vd "pptx-va-minimal" / "pdf-va-night"; khớp id (hoặc tên rút gọn
          // bỏ tiền tố "va-" cho link cũ kiểu "pdf-kids"). Không khớp → mẫu mặc định.
          const picked = SLIDE_TEMPLATES.find((t) => variant?.includes(t.id) || variant?.includes(t.id.replace("va-", "")));
          const theme: MarpTheme = picked?.id ?? "va-green";
          const fmt: MarpFormat = variant?.includes("pdf") ? "pdf" : "pptx";
          const md = slidesToMarp(cc.slides as unknown as Parameters<typeof slidesToMarp>[0], { code: atom.code, level: pkg.level, levelLabel: LEVEL_LABEL[pkg.level], title, theme });
          const buf = await renderMarpDeck(md, theme, fmt, cc.slides.map((s) => s.notes));
          if (buf) return file(buf, fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation", fmt);
        }
      }
      // Slide THƯƠNG HIỆU Việt Anh (fallback): xanh brand + đồng brass, LaTeX → ký hiệu đẹp, số trang, ghi chú giảng
      const PptxGen = (await import("pptxgenjs")).default;
      const pptx = new PptxGen();
      pptx.defineLayout({ name: "W", width: 13.33, height: 7.5 });
      pptx.layout = "W";
      const BRAND = "1E4D38", BRASS = "B08A3C", INK = "26332B", MUTED = "6B7A6E", MIST = "DCE8DF";
      const F = "Segoe UI", FB = "Segoe UI Semibold";       // typography: Segoe có sẵn mọi máy Windows — sang hơn hẳn Arial
      // bóng mềm "card" — PHẢI là factory: pptxgenjs MUTATE object shadow tại chỗ (quy đổi EMU),
      // dùng chung 1 const cho nhiều shape → lần 2 bị nhân đơn vị chồng (dir/alpha vượt trần) → file PPTX HỎNG
      const SH = () => ({ type: "outer" as const, color: "1E3A2A", blur: 8, offset: 2, angle: 90, opacity: 0.24 });
      const rm = readableMath;
      const c = asset.content as SlideContent;
      // nhãn định hướng nhỏ phía trên tiêu đề — người xem biết ngay slide này thuộc loại gì
      const kickerOf = (s: SlideV2, warn: boolean) =>
        warn ? "CẨN THẬN" : /luyện tập|thử sức|đến lượt|thử thách/i.test(s.title) ? "LUYỆN TẬP" : s.chart ? "TRỰC QUAN HÓA" : s.table ? "SỐ LIỆU THẬT" : s.steps?.length ? "CÁC BƯỚC LÀM" : s.cards?.length ? "Ý CHÍNH" : s.stat ? "CON SỐ BIẾT NÓI" : "BÀI HỌC";
      // lưới chấm trang trí (điểm nhấn tinh tế kiểu design system)
      const dotGrid = (slide: ReturnType<typeof pptx.addSlide>, x0: number, y0: number, cols: number, rows: number, color: string, op: number) => {
        for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++)
          slide.addShape(pptx.ShapeType.ellipse, { x: x0 + k * 0.3, y: y0 + r * 0.3, w: 0.065, h: 0.065, fill: { color, transparency: 100 - op } });
      };
      // ── Lớp trang trí "ppt-master-lite": vẽ phần tử do lượt đạo diễn mỹ thuật đặt (tọa độ % → inch).
      //    Rào an toàn: phần tử front rơi vào vùng nội dung trung tâm thì BỎ (không cho đè chữ). ──
      const DCOLOR: Record<string, string> = { brand: BRAND, brass: BRASS, mist: MIST, white: "FFFFFF", ink: INK };
      const CW = 13.33, CHh = 7.5;
      // Bài học nhìn tận mắt 2026-07-09/10: model rải shape tự do → đè tiêu đề (ring lọt dải y<16),
      // lọt vùng chữ (blob x<20 giữa trang). → RENDERER TỰ VỆ v2: CHỈ 3 zone an toàn tuyệt đối,
      // ngoài zone thì BỎ; sticker/line/arrow không render; chip ghim khe cố định.
      const inCorner = (d: DecorEl) =>
        (d.x >= 80 && d.y <= 12) ||   // góc trên-phải (trên bubble icon)
        (d.x <= 12 && d.y >= 70) ||   // góc dưới-trái
        (d.x >= 84 && d.y >= 66);     // góc dưới-phải
      const drawDecor = (slide: ReturnType<typeof pptx.addSlide>, decor: DecorEl[] | undefined, phase: "back" | "front") => {
        let chipDone = false;
        for (const d of decor || []) {
          const isFront = d.front === true;
          if ((phase === "front") !== isFront) continue;
          const col = DCOLOR[d.color || "brand"] || BRAND;
          const op = Math.min(d.opacity ?? (d.kind === "blob" ? 10 : 30), d.kind === "blob" ? 14 : 45); // trần độ đậm — hết "trứng đặc"
          const X = (v: number) => (v / 100) * CW, Y = (v: number) => (v / 100) * CHh;
          try {
            if (d.kind === "blob" && inCorner(d)) slide.addShape(pptx.ShapeType.ellipse, { x: X(d.x), y: Y(d.y), w: X(d.w ?? 18), h: Y(d.h ?? d.w ?? 18), fill: { color: col, transparency: 100 - op } });
            else if (d.kind === "ring" && inCorner(d) && d.y < 74) slide.addShape(pptx.ShapeType.ellipse, { x: X(d.x), y: Y(d.y), w: X(d.w ?? 10), h: Y(d.h ?? d.w ?? 10), fill: { color: "FFFFFF", transparency: 100 }, line: { color: col, width: 1.5, transparency: 100 - Math.min(op + 15, 60) } }); // y<74: vòng khuyên không được lết xuống dải footer
            else if (d.kind === "chip" && d.text && !chipDone) {
              // khe cố định: sát trên footer, phải — không bao giờ đè nội dung/số trang
              const w = Math.min(2.6, 0.15 * d.text.length + 0.5);
              slide.addText(rm(d.text), { shape: pptx.ShapeType.roundRect, rectRadius: 0.2, x: 12.6 - w, y: 6.5, w, h: 0.4, fill: { color: col === MIST || col === "FFFFFF" ? BRASS : col }, color: "FFFFFF", fontSize: 11.5, bold: true, align: "center", valign: "middle", fontFace: F });
              chipDone = true;
            }
            // sticker / arrow / line: cố tình KHÔNG render — motif thị giác do ghostTrend tất định đảm nhiệm
          } catch { /* một phần tử hỏng không được phá cả slide */ }
        }
      };
      // ── "GHOST TREND": vẽ mờ chính đường số liệu của deck làm motif trang trí — luôn đúng bài, luôn có bố cục ──
      const deckChart = c.slides.find((s) => s.chart)?.chart;
      // Fallback CHỐNG OVERFIT: deck không có chart (Văn/Sử/khái niệm…) hoặc chart <3 điểm (đường 2 điểm
      // = que chéo vô nghĩa) → vẽ mini ĐỒ THỊ TRI THỨC (node + cạnh) — đúng thương hiệu app, môn nào cũng hợp.
      const miniGraph = (slide: ReturnType<typeof pptx.addSlide>, box: { x: number; y: number; w: number; h: number }, strong: boolean) => {
        const N = [[0.08, 0.62], [0.32, 0.2], [0.52, 0.8], [0.72, 0.35], [0.94, 0.66], [0.62, 0.02]];
        const E = [[0, 1], [1, 3], [3, 4], [2, 3], [1, 2], [3, 5]];
        const P = N.map(([u, v]) => ({ x: box.x + u * box.w, y: box.y + v * box.h }));
        for (const [a, b] of E) slide.addShape(pptx.ShapeType.line, { x: Math.min(P[a].x, P[b].x), y: Math.min(P[a].y, P[b].y), w: Math.abs(P[b].x - P[a].x), h: Math.abs(P[b].y - P[a].y), flipV: (P[b].y < P[a].y) !== (P[b].x < P[a].x), line: { color: strong ? BRASS : BRAND, width: 1.75, transparency: strong ? 35 : 60 } });
        P.forEach((p, k) => {
          const hub = k === 3;
          slide.addShape(pptx.ShapeType.ellipse, { x: p.x - (hub ? 0.09 : 0.058), y: p.y - (hub ? 0.09 : 0.058), w: hub ? 0.18 : 0.115, h: hub ? 0.18 : 0.115, fill: { color: hub ? BRAND : BRASS, transparency: strong ? 8 : 30 }, line: hub ? { color: "E8C87A", width: 1 } : undefined });
        });
      };
      const ghostTrend = (slide: ReturnType<typeof pptx.addSlide>, box: { x: number; y: number; w: number; h: number }, strong = false, axes = false) => {
        if (!deckChart?.series[0] || deckChart.series[0].values.length < 3) { miniGraph(slide, box, strong); return; }
        const vals = deckChart.series[0].values;
        if (axes) { // thêm 2 trục chữ L → minh họa "biểu đồ" thật sự chứ không phải nét vẽ trôi nổi
          slide.addShape(pptx.ShapeType.line, { x: box.x - 0.08, y: box.y - 0.1, w: 0, h: box.h + 0.28, line: { color: strong ? BRASS : "9AAA9E", width: 1.4, transparency: 35 } });
          slide.addShape(pptx.ShapeType.line, { x: box.x - 0.08, y: box.y + box.h + 0.18, w: box.w + 0.26, h: 0, line: { color: strong ? BRASS : "9AAA9E", width: 1.4, transparency: 35 } });
        }
        const mn = Math.min(...vals), mx = Math.max(...vals);
        const pts = vals.map((v, k) => ({ x: box.x + (k * box.w) / (vals.length - 1), y: box.y + box.h - ((v - mn) / (mx - mn || 1)) * box.h }));
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1];
          slide.addShape(pptx.ShapeType.line, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), flipV: b.y < a.y, line: { color: strong ? BRASS : BRAND, width: 2.5, transparency: strong ? 25 : 62 } });
        }
        for (const p of pts) slide.addShape(pptx.ShapeType.ellipse, { x: p.x - 0.055, y: p.y - 0.055, w: 0.11, h: 0.11, fill: { color: BRASS, transparency: strong ? 10 : 40 } });
      };
      c.slides.forEach((s, i) => {
        const slide = pptx.addSlide();
        const warn = s.warn === true || /cẩn thận|lưu ý|nhầm/i.test(s.title);
        if (i === 0) {
          // ── Slide bìa: lớp trang trí — ưu tiên bản do ĐẠO DIỄN MỸ THUẬT đặt, không có thì dùng bộ tĩnh ──
          slide.background = { color: BRAND };
          if (s.decor?.length) drawDecor(slide, s.decor, "back");
          else {
            slide.addShape(pptx.ShapeType.ellipse, { x: 9.6, y: -2.2, w: 6.2, h: 6.2, fill: { color: "FFFFFF", transparency: 93 } });
            slide.addShape(pptx.ShapeType.ellipse, { x: 11.3, y: 3.9, w: 3.6, h: 3.6, fill: { color: BRASS, transparency: 80 } });
            slide.addShape(pptx.ShapeType.ellipse, { x: -1.4, y: 4.9, w: 4.4, h: 4.4, fill: { color: "FFFFFF", transparency: 95 } });
          }
          slide.addShape(pptx.ShapeType.ellipse, { x: 10.15, y: 0.75, w: 2.1, h: 2.1, fill: { color: "FFFFFF", transparency: 88 } });
          if (s.icon) slide.addText(s.icon, { x: 10.15, y: 0.75, w: 2.1, h: 2.1, fontSize: 66, align: "center", valign: "middle" });
          dotGrid(slide, 0.76, 0.55, 6, 2, "FFFFFF", 16); // lưới chấm góc trên-trái — điểm nhấn design system
          slide.addText(`${atom.code}  ·  MỨC ${pkg.level} — ${LEVEL_LABEL[pkg.level].toUpperCase()}`, { x: 0.72, y: 1.72, w: 9, h: 0.4, fontSize: 12.5, color: "C9A94E", fontFace: FB, charSpacing: 3 });
          slide.addShape(pptx.ShapeType.rect, { x: 0.72, y: 2.24, w: 1.7, h: 0.09, fill: { color: BRASS } });
          slide.addText(rm(s.title), { x: 0.7, y: 2.52, w: 9.3, h: 1.85, bold: true, fontSize: 42, color: "FFFFFF", fontFace: FB, valign: "top" });
          if (s.stat) {
            slide.addText(rm(s.stat.value), { x: 0.7, y: 4.32, w: 6.4, h: 1.15, bold: true, fontSize: 58, color: "E8C87A", fontFace: FB });
            slide.addShape(pptx.ShapeType.rect, { x: 0.76, y: 5.42, w: 0.85, h: 0.055, fill: { color: BRASS } });
            slide.addText(rm(s.stat.label), { x: 0.75, y: 5.52, w: 8.5, h: 0.6, fontSize: 15.5, color: MIST, fontFace: F });
          } else if (s.bullets?.length) {
            slide.addText(s.bullets.map((x) => rm(x)).join("    ·    "), { x: 0.7, y: 4.5, w: 11, h: 0.9, fontSize: 18, color: MIST, fontFace: F });
          }
          ghostTrend(slide, { x: 8.85, y: 4.55, w: 3.45, h: 1.75 }, true); // motif số liệu của chính bài — brass nổi trên nền xanh
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.06, w: 13.33, h: 0.44, fill: { color: "173D2C" } });
          slide.addText(`Trường Việt Anh — Xưởng Học liệu AI · ${atom.code} · mức ${pkg.level} (${LEVEL_LABEL[pkg.level]})`, { x: 0.7, y: 7.06, w: 12, h: 0.44, fontSize: 12, color: "9DBBA8", fontFace: F, valign: "middle" });
          drawDecor(slide, s.decor, "front");
          if (s.notes) slide.addNotes(rm(s.notes));
          return;
        }
        // ── SLIDE CHỐT (cuối deck, chỉ bullets): bookend TỐI MÀU đối xứng với bìa — deck có mở có đóng ──
        const closing = i === c.slides.length - 1 && !!s.bullets?.length && !s.chart && !s.table && !s.steps?.length && !s.cards?.length && !s.stat;
        if (closing) {
          slide.background = { color: BRAND };
          slide.addShape(pptx.ShapeType.ellipse, { x: 10.2, y: -2.4, w: 5.8, h: 5.8, fill: { color: "FFFFFF", transparency: 94 } });
          slide.addShape(pptx.ShapeType.ellipse, { x: -1.6, y: 5.1, w: 4.2, h: 4.2, fill: { color: BRASS, transparency: 86 } });
          dotGrid(slide, 11.35, 0.6, 5, 2, "FFFFFF", 16);
          slide.addText("CHỐT LẠI ĐỂ NHỚ", { x: 0.72, y: 0.62, w: 8, h: 0.36, fontSize: 12, color: "C9A94E", fontFace: FB, charSpacing: 3 });
          slide.addText(rm(s.title), { x: 0.7, y: 1.0, w: 10.5, h: 0.95, bold: true, fontSize: 32, color: "FFFFFF", fontFace: FB });
          slide.addShape(pptx.ShapeType.rect, { x: 0.72, y: 1.98, w: 1.15, h: 0.07, fill: { color: BRASS } });
          const nB = s.bullets!.length;
          const rowH2 = Math.min(1.2, 4.2 / nB);
          const yB = 2.45 + (4.2 - rowH2 * nB) / 2;
          s.bullets!.forEach((b, k) => {
            const y = yB + k * rowH2;
            slide.addText(String(k + 1), { shape: pptx.ShapeType.ellipse, fill: { color: BRASS }, line: { color: "E8C87A", width: 1 }, x: 0.95, y: y + (rowH2 - 0.56) / 2, w: 0.56, h: 0.56, align: "center", fontSize: 18, bold: true, color: "FFFFFF", fontFace: FB });
            slide.addText(rm(b), { x: 1.78, y, w: 9.3, h: rowH2, fontSize: 19, color: "F2F6F3", fontFace: F, valign: "middle" });
          });
          ghostTrend(slide, { x: 10.75, y: 5.35, w: 1.95, h: 1.05 }, true, true);
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.06, w: 13.33, h: 0.44, fill: { color: "173D2C" } });
          slide.addText(`Trường Việt Anh — Xưởng Học liệu AI · ${atom.code} · mức ${pkg.level} (${LEVEL_LABEL[pkg.level]})`, { x: 0.7, y: 7.06, w: 12, h: 0.44, fontSize: 12, color: "9DBBA8", fontFace: F, valign: "middle" });
          if (s.notes) slide.addNotes(rm(s.notes));
          return;
        }
        const practice = /luyện tập|thử sức|đến lượt|thử thách/i.test(s.title);
        slide.background = { color: warn ? "FDF9F0" : practice ? "F2F7F2" : "FFFFFF" }; // Cẩn thận: kem ấm · Luyện tập: xanh sương — mỗi loại một khí sắc
        // ── tầng trang trí — ưu tiên bản của đạo diễn mỹ thuật; không có thì bộ góc tĩnh ──
        if (s.decor?.length) drawDecor(slide, s.decor, "back");
        else {
          slide.addShape(pptx.ShapeType.ellipse, { x: 12.15, y: -1.15, w: 2.6, h: 2.6, fill: { color: warn ? BRASS : BRAND, transparency: 91 } });
          slide.addShape(pptx.ShapeType.ellipse, { x: -0.85, y: 6.15, w: 2.3, h: 2.3, fill: { color: BRASS, transparency: 90 } });
        }
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.16, fill: { color: warn ? BRASS : BRAND } });
        slide.addText(kickerOf(s, warn), { x: 0.72, y: 0.36, w: 8, h: 0.32, fontSize: 10.5, color: warn ? BRASS : "8FA898", fontFace: FB, charSpacing: 2.6 });
        slide.addText((warn ? "⚠ " : "") + rm(s.title), { x: 0.7, y: 0.66, w: 10.6, h: 0.92, bold: true, fontSize: 27, color: warn ? "8A6A20" : BRAND, fontFace: FB });
        slide.addShape(pptx.ShapeType.rect, { x: 0.72, y: 1.56, w: 1.15, h: 0.06, fill: { color: warn ? BRAND : BRASS } });
        // slide CHỮ THUẦN (bullets/steps, không bảng/chart/thẻ/số): bố cục SPLIT — trái nội dung căn giữa dọc,
        // phải panel màu có badge icon + ghost trend. Hết cảnh 3 dòng chữ trơ trên trang trống.
        const textOnly = !s.chart && !s.table && !s.cards?.length && !s.stat && !!(s.bullets?.length || s.steps?.length);
        if (s.icon && !textOnly) {
          slide.addShape(pptx.ShapeType.ellipse, { x: 11.55, y: 0.32, w: 1.25, h: 1.25, fill: { color: "FFFFFF" }, line: { color: warn ? "E3D3AD" : "CFE0D2", width: 1 }, shadow: SH() });
          slide.addText(s.icon, { x: 11.55, y: 0.32, w: 1.25, h: 1.25, fontSize: 40, align: "center", valign: "middle" });
        }
        // panel đổi BÊN xen kẽ theo vị trí slide — deck có nhịp trái/phải như designer dàn tay
        const panelLeft = textOnly && i % 2 === 0;
        const px = panelLeft ? 0.7 : 9.0;          // gốc x của panel
        const cx0 = panelLeft ? 4.75 : 0.95;        // gốc x của nội dung chữ
        if (textOnly) {
          slide.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.12, x: px, y: 1.9, w: 3.6, h: 4.7, fill: { color: warn ? "FAF6EC" : "EFF5EF" }, line: { color: warn ? "E3D3AD" : "CFE0D2", width: 1 }, shadow: SH() });
          slide.addShape(pptx.ShapeType.ellipse, { x: px + 1.23, y: 2.34, w: 1.15, h: 1.15, fill: { color: "FFFFFF" }, line: { color: warn ? BRASS : BRAND, width: 1.5 }, shadow: SH() });
          if (s.icon) slide.addText(s.icon, { x: px + 1.23, y: 2.34, w: 1.15, h: 1.15, fontSize: 38, align: "center", valign: "middle" });
          ghostTrend(slide, { x: px + 0.55, y: 4.08, w: 2.5, h: 1.75 }, true, true);
        }
        slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 6.97, w: 11.95, h: 0, line: { color: warn ? "EADFC2" : "E3EAE4", width: 0.75 } }); // hairline chân trang
        slide.addText(`${atom.code} · mức ${pkg.level} · Trường Việt Anh`, { x: 0.7, y: 7.03, w: 8, h: 0.35, fontSize: 10, color: MUTED, fontFace: F });
        slide.addText(`${i + 1} / ${c.slides.length}`, { x: 11.9, y: 7.03, w: 0.75, h: 0.35, fontSize: 10, color: MUTED, align: "right", fontFace: F });
        if (s.notes) slide.addNotes(rm(s.notes));

        // caption phụ (khi slide có khối trực quan mà vẫn kèm 1-2 bullet dẫn dắt)
        const hasVisual = !!(s.chart || s.table || s.steps?.length || s.cards?.length || s.stat);
        let bodyY = 1.9;
        if (hasVisual && s.bullets?.length) {
          slide.addText(s.bullets.map((x) => rm(x)).join("   ·   "), { x: 0.72, y: 1.74, w: 11.9, h: 0.4, fontSize: 13.5, color: MUTED, fontFace: F, italic: true });
          bodyY = 2.25;
        }

        // ── LƯỚI THẺ MÀU (2-4 thẻ) — chiều cao CO THEO NỘI DUNG + cả lưới căn giữa dọc (hết card trống 70%) ──
        if (s.cards?.length) {
          const n = s.cards.length, perRow = n === 4 ? 2 : n, rows = Math.ceil(n / perRow);
          const gw = 11.9 / perRow, cw = gw - 0.25;
          const estH = (cd: SlideCard) => {
            const lines = cd.text ? Math.max(1, Math.ceil((rm(cd.text).length / (cw * 7.2)) )) : 0; // ~7.2 ký tự/inch @13pt
            return Math.min(2.3, Math.max(1.02, 0.68 + lines * 0.32));
          };
          const rowHs = Array.from({ length: rows }, (_, r) => Math.max(...s.cards!.slice(r * perRow, r * perRow + perRow).map(estH)));
          const totalH = rowHs.reduce((a, b) => a + b, 0) + (rows - 1) * 0.28;
          const cy0 = bodyY + Math.max(0.1, (6.55 - bodyY - totalH) / 2);
          s.cards.forEach((cd, j) => {
            const r = Math.floor(j / perRow);
            const cy = cy0 + rowHs.slice(0, r).reduce((a, b) => a + b, 0) + r * 0.28;
            const gh = rowHs[r];
            const cx = 0.72 + (j % perRow) * gw;
            slide.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.09, x: cx, y: cy, w: cw, h: gh, fill: { color: "FFFFFF" }, line: { color: j % 2 ? "E9DDBE" : "D8E4DA", width: 1 }, shadow: SH() });
            slide.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.03, x: cx + 0.12, y: cy + 0.14, w: 0.07, h: gh - 0.28, fill: { color: j % 2 ? BRASS : BRAND } });
            slide.addText(
              [
                { text: (cd.icon ? cd.icon + "  " : "") + rm(cd.title), options: { bold: true, fontSize: 16.5, color: BRAND, fontFace: FB, breakLine: true, paraSpaceAfter: 5 } },
                ...(cd.text ? [{ text: rm(cd.text), options: { fontSize: 13, color: INK, fontFace: F, breakLine: true } }] : []),
              ],
              { x: cx + 0.3, y: cy + 0.05, w: cw - 0.42, h: gh - 0.1, align: "left", valign: "middle", fontFace: F }
            );
          });
        }
        // ── CON SỐ LỚN — thước brass dưới số + vòng icon có bóng + ghost trend trong vòng ──
        if (s.stat && !s.cards?.length) {
          slide.addShape(pptx.ShapeType.ellipse, { x: 8.9, y: bodyY + 0.35, w: 3.3, h: 3.3, fill: { color: "EFF5EF" }, line: { color: "D8E4DA", width: 1 }, shadow: SH() });
          ghostTrend(slide, { x: 9.45, y: bodyY + 1.25, w: 2.2, h: 1.5 }, true, true);
          slide.addText(rm(s.stat.value), { x: 0.9, y: bodyY + 0.6, w: 7.6, h: 1.9, bold: true, fontSize: 80, color: BRAND, fontFace: FB });
          slide.addShape(pptx.ShapeType.rect, { x: 0.98, y: bodyY + 2.55, w: 1.1, h: 0.07, fill: { color: BRASS } });
          slide.addText(rm(s.stat.label), { x: 0.95, y: bodyY + 2.7, w: 10.5, h: 0.9, fontSize: 19, color: MUTED, fontFace: F });
        }

        // ── BIỂU ĐỒ THẬT (chart native PowerPoint — giáo viên sửa được số liệu) — nằm trong CARD trắng có bóng ──
        if (s.chart) {
          const half = !!s.table; // có cả bảng → chia đôi màn
          const bx = half ? 6.55 : 0.9, bw2 = half ? 6.1 : 11.5, bh2 = 6.55 - bodyY;
          slide.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.1, x: bx - 0.15, y: bodyY - 0.1, w: bw2 + 0.3, h: bh2 + 0.25, fill: { color: "FFFFFF" }, line: { color: "E3EAE4", width: 1 }, shadow: SH() });
          const data = s.chart.series.map((se) => ({ name: rm(se.name), labels: s.chart!.categories.map((x) => rm(x)), values: se.values }));
          // trục "vạch đẹp" đặt tường minh — PowerPoint auto hay chọn bước 5 làm giá trị 12 lơ lửng giữa vạch
          const cvals = s.chart.series.flatMap((se) => se.values);
          const ax = niceTicks(Math.min(0, ...cvals), Math.max(...cvals, 1));
          // line chart có điểm CHẠM trần trục → nhãn giá trị trên điểm bị xén; nới thêm 1 bước cho nhãn thở
          const axHi = s.chart.type === "line" && Math.max(...cvals) >= ax.hi ? ax.hi + ax.step : ax.hi;
          slide.addChart(s.chart.type === "bar" ? pptx.ChartType.bar : pptx.ChartType.line, data, {
            x: bx, y: bodyY + 0.05, w: bw2, h: bh2 - 0.05,
            valAxisMinVal: ax.lo, valAxisMaxVal: axHi, valAxisMajorUnit: ax.step,
            chartColors: [BRAND, BRASS, "2E6B4F"],
            lineSize: 3.5, lineDataSymbol: "circle", lineDataSymbolSize: 10, lineDataSymbolLineColor: "FFFFFF",
            catAxisTitle: rm(s.chart.xLabel || ""), showCatAxisTitle: !!s.chart.xLabel,
            valAxisTitle: rm(s.chart.yLabel || ""), showValAxisTitle: !!s.chart.yLabel,
            catAxisTitleFontSize: 11.5, valAxisTitleFontSize: 11.5,
            catAxisLabelFontSize: 11.5, valAxisLabelFontSize: 11.5,
            catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLineColor: "C9D4CB", valAxisLineColor: "E7EDE8",
            valGridLine: { style: "solid", size: 0.5, color: "EDF2EE" },
            showLegend: s.chart.series.length > 1, legendPos: "b", legendFontSize: 11.5,
            showValue: !half, dataLabelFontSize: 11, dataLabelColor: BRAND, dataLabelPosition: "t",
            fontFace: F,
          });
        }
        // ── BẢNG SỐ LIỆU THẬT ──
        if (s.table) {
          const half = !!s.chart;
          const tw = half ? 5.6 : 10.1, tx = half ? 0.7 : 1.6;
          const rowH = 0.48;
          const tableH = rowH * (s.table.rows.length + 1);
          // bảng đứng MỘT MÌNH → căn giữa dọc vùng nội dung (hết cảnh bảng bé dính trần, dưới trống 60%)
          const ty = half ? bodyY + 0.15 : Math.max(bodyY + 0.15, bodyY + (6.55 - bodyY - tableH) / 2);
          // card trắng có bóng lót dưới bảng
          slide.addShape(pptx.ShapeType.roundRect, { rectRadius: 0.1, x: tx - 0.18, y: ty - 0.18, w: tw + 0.36, h: tableH + 0.36, fill: { color: "FFFFFF" }, line: { color: "E3EAE4", width: 1 }, shadow: SH() });
          const header = s.table.headers.map((h) => ({ text: rm(h), options: { fill: { color: BRAND }, color: "FFFFFF", bold: true, fontFace: FB } }));
          // zebra: dòng chẵn nền sương nhạt — mắt dò hàng không lạc
          const body = s.table.rows.map((r, ri) => r.map((cell) => ({ text: rm(cell), options: { fill: { color: ri % 2 ? "F4F7F2" : "FFFFFF" } } })));
          slide.addTable([header, ...body], {
            x: tx, y: ty, w: tw,
            border: { type: "solid", pt: 0.5, color: "D8E4DA" },
            fontSize: half ? 14 : 15.5, fontFace: F, color: INK,
            align: "center", valign: "middle", rowH, autoPage: false,
          });
        }
        // ── CÁC BƯỚC LÀM — badge số tròn + DÂY NỐI dọc (nhìn ra quy trình, không phải list rời) ──
        if (s.steps?.length) {
          const stepH = Math.min(0.95, (6.6 - bodyY) / s.steps.length);
          if (s.steps.length > 1) {
            const y1 = bodyY + 0.1 + 0.26, y2 = bodyY + 0.1 + (s.steps.length - 1) * stepH + 0.26;
            slide.addShape(pptx.ShapeType.line, { x: cx0 + 0.26, y: y1, w: 0, h: y2 - y1, line: { color: "9DBBA8", width: 2, dashType: "dash" } });
          }
          s.steps.forEach((st, j) => {
            const y = bodyY + 0.1 + j * stepH;
            slide.addText(String(j + 1), { shape: pptx.ShapeType.ellipse, fill: { color: j === s.steps!.length - 1 ? BRASS : BRAND }, line: { color: "FFFFFF", width: 1.5 }, x: cx0, y, w: 0.52, h: 0.52, align: "center", fontSize: 17, bold: true, color: "FFFFFF", fontFace: FB });
            slide.addText(rm(st).replace(/^[①-⑨]\s*/, ""), { x: cx0 + 0.7, y: y - 0.04, w: textOnly ? 7.1 : 10.7, h: Math.max(0.6, stepH - 0.1), fontSize: 17.5, color: INK, fontFace: F, valign: "middle" });
          });
        }
        // ── chỉ chữ: bullets CĂN GIỮA DỌC — luyện tập thì đánh SỐ (câu 1,2,3), thường thì chấm tròn ──
        if (!hasVisual && s.bullets?.length) {
          slide.addText(
            s.bullets.map((b) => ({ text: rm(b), options: { bullet: practice ? { type: "number" as const } : { code: "2022" }, breakLine: true, paraSpaceAfter: 14 } })),
            { x: textOnly ? cx0 : 0.95, y: 1.85, w: textOnly ? 7.7 : 11.4, h: 4.7, fontSize: 20, color: INK, fontFace: F, lineSpacing: 32, valign: "middle" }
          );
        }
        drawDecor(slide, s.decor, "front"); // sticker/chip rìa — vẽ SAU nội dung
      });
      const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
      return file(buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx");
    }

    // ── Phiếu học tập → PDF in đẹp qua Typst (thiếu binary → rơi xuống DOCX bên dưới) ──
    if (asset.format === "worksheet") {
      const c = asset.content as SectionContent;
      const chain = ancestors(db, atom.id).map((n) => n.title).join(" › ");
      const pdf = await typstPdf("worksheet.typ", {
        school: "Trường Việt Anh", title: readableMath(atom.title), code: atom.code,
        level: pkg.level, levelLabel: LEVEL_LABEL[pkg.level], chain: readableMath(chain),
        sections: c.sections.map((s) => ({ heading: readableMath(s.heading), blocks: wsBlocks(s.body) })),
      });
      if (pdf) return file(pdf, "application/pdf", "pdf");
    }

    // ── Podcast → MP3 giọng Việt THẬT (edge-tts) — xem podcastMp3() ở đầu file ──
    if (asset.format === "podcast" && variant === "mp3") {
      return file(await podcastMp3((asset.content as PodcastContent).script), "audio/mpeg", "mp3");
    }

    // ── Bài đọc → PDF in đẹp (layout đọc, hộp VÍ DỤ/CẨN THẬN có tông màu; thiếu binary → DOCX) ──
    if (asset.format === "text") {
      const c = asset.content as SectionContent;
      const chain = ancestors(db, atom.id).map((n) => n.title).join(" › ");
      // chart của section → file SVG cạnh main.typ; template nhúng bằng image() thành hình in thật
      const charts: Record<string, string> = {};
      const sections = c.sections.map((s, i) => {
        const blocks: (WsBlock | { kind: "chart"; file: string })[] = wsBlocks(s.body);
        if (s.chart) {
          const fname = `chart${i}.svg`;
          charts[fname] = chartSvgStr(s.chart);
          blocks.push({ kind: "chart", file: fname });
        }
        return { heading: readableMath(s.heading), blocks };
      });
      const pdf = await typstPdf("baidoc.typ", {
        school: "Trường Việt Anh", title: readableMath(atom.title), code: atom.code,
        level: pkg.level, levelLabel: LEVEL_LABEL[pkg.level], chain: readableMath(chain),
        sections, answers: (c.answers || []).map((x) => readableMath(x)),
      }, charts);
      if (pdf) return file(pdf, "application/pdf", "pdf");
    }

    if (asset.format === "text" || asset.format === "worksheet" || asset.format === "podcast" || asset.format === "video") {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
      const rm = readableMath;
      const paras: InstanceType<typeof Paragraph>[] = [
        new Paragraph({ text: rm(title), heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: `Mã nguyên tử: ${atom.code} · Xưởng Học liệu AI — Trường Việt Anh`, italics: true, size: 18 })] }),
        new Paragraph({ text: "" }),
      ];
      if (asset.format === "podcast") {
        const c = asset.content as PodcastContent;
        paras.push(new Paragraph({ text: "Kịch bản podcast", heading: HeadingLevel.HEADING_1 }));
        for (const line of c.script) paras.push(new Paragraph({ children: [new TextRun({ text: `${line.speaker}: `, bold: true }), new TextRun(rm(line.text))] }));
      } else if (asset.format === "video") {
        const c = asset.content as VideoContent;
        const mm = Math.round((c.durationSec || 0) / 60), ss = (c.durationSec || 0) % 60;
        const roleLabel: Record<string, string> = { veo: "QUAY · VEO", avatar: "AVATAR · DƯƠNG", graphics: "ĐỒ HOẠ" };
        // đẩy một khối văn bản nhiều dòng (mỗi \n = 1 đoạn); mono=true dùng cho prompt Veo/bible tiếng Anh.
        const pushBlock = (txt: string, mono = false) => String(txt || "").split("\n").forEach((line) =>
          paras.push(new Paragraph({ children: [new TextRun({ text: line, font: mono ? "Consolas" : undefined, size: mono ? 18 : undefined })] })));
        paras.push(new Paragraph({ text: "Kịch bản video — bộ dựng đầy đủ", heading: HeadingLevel.HEADING_1 }));
        if (c.videoTitle) paras.push(new Paragraph({ children: [new TextRun({ text: "Tên video: ", bold: true }), new TextRun({ text: rm(c.videoTitle), bold: true })] }));
        if (c.logline) paras.push(new Paragraph({ children: [new TextRun({ text: "Tình huống: ", bold: true }), new TextRun({ text: rm(c.logline), italics: true })] }));
        paras.push(new Paragraph({ children: [new TextRun({ text: `Thời lượng ~${c.durationSec ? `${mm}:${String(ss).padStart(2, "0")}` : "≤3"} phút · ${c.style || "Hoạt hình 2D + quay thực"}`, size: 20 })] }));
        if (c.characters?.length) paras.push(new Paragraph({ children: [new TextRun({ text: "Nhân vật: ", bold: true }), new TextRun(rm(c.characters.map((ch) => `${ch.name}${ch.role ? ` (${ch.role})` : ""}`).join(" · ")))] }));
        paras.push(new Paragraph({ text: "" }));
        // ── PHẦN A — kịch bản 7 nhịp (theo atom) ──
        paras.push(new Paragraph({ text: "PHẦN A — Kịch bản 7 nhịp", heading: HeadingLevel.HEADING_1 }));
        c.scenes.forEach((s, i) => {
          const beat = s.beat ? ` — ${s.beat.toUpperCase()}` : "";
          const role = s.role ? `  [${roleLabel[s.role] || s.role}]` : "";
          const dur = s.durationSec ? ` (${s.durationSec}s)` : "";
          paras.push(new Paragraph({ text: `Cảnh ${i + 1}${beat}${role}${dur}`, heading: HeadingLevel.HEADING_2 }));
          if (s.setting) paras.push(new Paragraph({ children: [new TextRun({ text: "Bối cảnh: ", bold: true }), new TextRun({ text: rm(s.setting), italics: true })] }));
          paras.push(new Paragraph({ children: [new TextRun({ text: "Hình ảnh: ", bold: true }), new TextRun(rm(s.visual))] }));
          // Thoại mới (dialogue[]); rơi về narration cho asset cũ.
          if (s.dialogue?.length) {
            for (const d of s.dialogue) paras.push(new Paragraph({ children: [
              new TextRun({ text: `${d.speaker}: `, bold: true }), new TextRun(rm(d.line)),
              ...(d.action ? [new TextRun({ text: `  ${d.action}`, italics: true })] : []),
            ] }));
          } else if (s.narration) {
            paras.push(new Paragraph({ children: [new TextRun({ text: "Lời thoại: ", bold: true }), new TextRun(rm(s.narration))] }));
          }
          if (s.onScreenText) paras.push(new Paragraph({ children: [new TextRun({ text: "Chữ trên màn: ", bold: true }), new TextRun({ text: `“${rm(s.onScreenText)}”`, italics: true })] }));
          if (s.animation) paras.push(new Paragraph({ children: [new TextRun({ text: "Animation: ", bold: true }), new TextRun(rm(s.animation))] }));
          if (s.role === "veo" && s.veoAction) {
            paras.push(new Paragraph({ children: [new TextRun({ text: `Prompt Veo (tiếng Anh)${s.veoCast?.length ? ` · ${s.veoCast.join(", ")}` : ""}:`, bold: true })] }));
            pushBlock(assembleVeoPrompt(s.veoAction, s.veoCast), true);
          }
          if (s.mucTieu) paras.push(new Paragraph({ children: [new TextRun({ text: "Mục tiêu sư phạm: ", bold: true }), new TextRun({ text: rm(s.mucTieu), italics: true })] }));
          paras.push(new Paragraph({ text: "" }));
        });
        // ── PHẦN B — bộ dựng cố định (dùng chung mọi video) ──
        paras.push(new Paragraph({ text: "PHẦN B — Bộ dựng cố định", heading: HeadingLevel.HEADING_1 }));
        paras.push(new Paragraph({ text: "Cơ chế video tự ngưng (P1 / P2)", heading: HeadingLevel.HEADING_2 }));
        pushBlock(PAUSE_MECHANISM_VI);
        paras.push(new Paragraph({ text: "" }));
        paras.push(new Paragraph({ text: "Style & Character Bible (dán vào mọi prompt Veo)", heading: HeadingLevel.HEADING_2 }));
        paras.push(new Paragraph({ children: [new TextRun({ text: "[STYLE]", bold: true })] }));
        pushBlock(STYLE_BLOCK, true);
        paras.push(new Paragraph({ children: [new TextRun({ text: "[SCHOOL — bối cảnh sân trường]", bold: true })] }));
        pushBlock(SCHOOL_SETTING, true);
        for (const k of ["TIM", "AN", "LEO"]) { paras.push(new Paragraph({ children: [new TextRun({ text: `[${k}]`, bold: true })] })); pushBlock(CHAR_BIBLE[k], true); }
        paras.push(new Paragraph({ text: "" }));
        paras.push(new Paragraph({ text: "Hướng dẫn kỹ thuật Veo & dựng", heading: HeadingLevel.HEADING_2 }));
        pushBlock(VEO_TECH_GUIDE_VI);
        paras.push(new Paragraph({ text: "" }));
        paras.push(new Paragraph({ text: "Checklist trước khi phát hành", heading: HeadingLevel.HEADING_2 }));
        pushBlock(RELEASE_CHECKLIST_VI);
      } else {
        const c = asset.content as SectionContent;
        for (const s of c.sections) {
          paras.push(new Paragraph({ text: rm(s.heading), heading: HeadingLevel.HEADING_1 }));
          for (const line of rm(s.body).split("\n"))
            paras.push(new Paragraph({ children: line.split(/\*\*(.+?)\*\*/g).map((part, k) => ({ part, bold: k % 2 === 1 })).filter((x) => x.part).map((x) => new TextRun({ text: x.part, bold: x.bold })) }));
          if (s.chart) paras.push(new Paragraph({ children: [new TextRun({ text: "📊 (Biểu đồ minh hoạ — xem bản PDF hoặc trên app)", italics: true })] }));
        }
        if (asset.format === "text" && c.answers?.length) {
          paras.push(new Paragraph({ text: "Đáp án tự kiểm", heading: HeadingLevel.HEADING_1 }));
          c.answers.forEach((a, i) => paras.push(new Paragraph({ text: `${i + 1}. ${rm(a)}` })));
        }
      }
      const doc = new Document({ sections: [{ children: paras }] });
      const buf = await Packer.toBuffer(doc);
      return file(Buffer.from(buf), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
    }

    if (asset.format === "quiz") {
      const c = asset.content as QuizContent;
      const isPlaceholder = (s: string) => /^\(/.test(s.trim()) || /\(đúng\)/i.test(s);
      // GIFT: LaTeX → chữ đọc được, rồi escape ký tự điều khiển (~ = # { } :) — câu toán chứa "=" sẽ VỠ nếu không escape
      const esc = (s: string) => readableMath(s).replace(/\\/g, "\\\\").replace(/([~=#{}:])/g, "\\$1").replace(/\s*\n+\s*/g, " ").trim();
      const fb = (s?: string) => (s ? `\n####${esc(s)}` : "");
      const head = [
        `// Ngân hàng câu hỏi GIFT — ${readableMath(title)}`,
        `// Nhập vào Moodle: Ngân hàng câu hỏi → Nhập (Import) → định dạng GIFT`,
        `$CATEGORY: $course$/VietAnh/${atom.code}`,
      ].join("\n");
      const gift = c.questions.map((q, i) => {
        const name = `::${atom.code} Q${i + 1}::`;
        if (q.type === "mcq" && q.options) {
          if (q.options.some(isPlaceholder)) return `// Câu ${i + 1} — cần giáo viên biên tập đáp án trước khi dùng:\n// ${readableMath(q.q)}`;
          const opts = q.options.map((o, j) => `${j === Number(q.answer) ? "=" : "~"}${esc(o)}`).join("\n");
          return `${name}${esc(q.q)} {\n${opts}${fb(q.explanation)}\n}`;
        }
        if (q.type === "tf") {
          // asset cũ có thể lưu answer dạng số (index của options) hoặc chữ — coercion về boolean cho chắc đáp án
          const isTrue = q.answer === true
            || (typeof q.answer === "number" && Array.isArray(q.options) && /đúng|true/i.test(q.options[q.answer] || ""))
            || /^(true|đúng|t)$/i.test(String(q.answer).trim());
          return `${name}${esc(q.q)} {${isTrue ? "TRUE" : "FALSE"}${fb(q.explanation)}\n}`;
        }
        if (isPlaceholder(String(q.answer))) return `// Câu ${i + 1} — cần giáo viên điền đáp án:\n// ${readableMath(q.q)}`;
        return `${name}${esc(q.q)} {\n=${esc(String(q.answer))}${fb(q.explanation)}\n}`;
      }).join("\n\n");
      return file(`${head}\n\n${gift}`, "text/plain; charset=utf-8", "gift.txt");
    }

    if (asset.format === "mindmap") {
      // File HTML TỰ MỞ trong trình duyệt: mindmap tương tác (zoom, thu gọn nhánh) — gửi Zalo/Drive đều dùng được.
      // markmap-autoloader tải qua CDN (cần Internet khi mở); nội dung nằm sẵn trong file.
      const c = asset.content as MindmapContent;
      const htmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeTitle = htmlEsc(readableMath(title));
      const md = readableMath(c.markdown).replace(/<\/(script)/gi, "<\\/$1");
      // chart đính kèm → nút 📊 trong header bật/tắt panel số liệu nổi (SVG nằm sẵn trong file, không cần mạng)
      const chartBtn = c.chart ? `<button id="cbt" onclick="document.getElementById('cbox').hidden=!document.getElementById('cbox').hidden">📊 Số liệu</button>` : "";
      const chartBox = c.chart ? `<div id="cbox" hidden><p>SỐ LIỆU MINH HOẠ</p>${chartSvgStr(c.chart)}</div>` : "";
      const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle} — Sơ đồ tư duy</title>
<style>html,body{margin:0;height:100%}#hdr{font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif;padding:10px 16px;color:#1E3A2A;border-bottom:1px solid #DDE5DC;background:#F4F7F2;display:flex;align-items:center;gap:12px;flex-wrap:wrap}#hdr small{font-weight:400;color:#5A6B5E}.markmap{width:100vw;height:calc(100vh - 42px)}
#cbt{margin-left:auto;border:1px solid #DDE5DC;background:#fff;color:#1E4D38;border-radius:8px;padding:5px 12px;font:600 12.5px ui-sans-serif,system-ui,sans-serif;cursor:pointer}
#cbox{position:fixed;right:12px;top:52px;z-index:9;width:min(560px,calc(100vw - 24px));background:#fff;border:1px solid #DDE5DC;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(30,58,42,.16)}
#cbox p{margin:0 0 6px;font:700 10.5px ui-sans-serif,system-ui,sans-serif;letter-spacing:.12em;color:#B08A3C}</style>
</head><body>
<div id="hdr">${safeTitle} <small>· ${atom.code} · Trường Việt Anh — kéo/zoom, bấm nút tròn để thu gọn nhánh (cần Internet lần đầu mở)</small>${chartBtn}</div>
${chartBox}
<div class="markmap"><script type="text/template">
${md}
</script></div>
<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18"></script>
</body></html>`;
      return file(html, "text/html; charset=utf-8", "html");
    }

    if (asset.format === "flashcard") {
      const c = asset.content as { cards: { front: string; back: string }[] };
      // ── variant=apkg: bộ thẻ Anki đúng chuẩn — học sinh mở file là import, có lịch ôn ngắt quãng ──
      if (variant === "apkg") {
        const AnkiExport = (await import("anki-apkg-export")).default;
        const deck = new AnkiExport(`Việt Anh · ${atom.code} — ${readableMath(atom.title)}`);
        for (const card of c.cards) deck.addCard(readableMath(card.front), readableMath(card.back).replace(/\n/g, "<br>"));
        const zip = (await deck.save()) as Buffer;
        return file(Buffer.from(zip), "application/apkg", "apkg");
      }
      // CSV nhập thẳng Anki/Quizlet: LaTeX → chữ đọc được, xuống dòng trong ô → " — " (Quizlet nhập theo dòng)
      const cell = (s: string) => `"${readableMath(s).replace(/\s*\n+\s*/g, " — ").replace(/"/g, '""')}"`;
      const csv = "front,back\n" + c.cards.map((x) => `${cell(x.front)},${cell(x.back)}`).join("\n");
      return file(csv, "text/csv; charset=utf-8", "csv");
    }

    throw new Error("Định dạng chưa hỗ trợ xuất");
  }
}

const BOM = "﻿"; // để Excel/Notepad đọc đúng UTF-8 tiếng Việt
const asBuf = (d: Buffer | string) => (typeof d === "string" ? Buffer.from(BOM + d, "utf-8") : d);

export async function GET(req: NextRequest) {
  const db = getDB();
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    // ── Tải HÀNG LOẠT: ?ids=a,b,c → gói ZIP (mỗi asset dùng biến thể mặc định: flashcard=CSV, podcast=kịch bản DOCX) ──
    const idsParam = req.nextUrl.searchParams.get("ids");
    if (idsParam) {
      const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
      if (!ids.length) return NextResponse.json({ error: "Chưa chọn học liệu nào" }, { status: 400 });
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const skipped: string[] = [];
      const used = new Set<string>();
      for (const id of ids) {
        const a = db.assets.find((x) => x.id === id);
        if (!a) { skipped.push(`${id}: không tồn tại`); continue; }
        try {
          const o = await buildExport(db, a, null);
          let name = `${o.base}.${o.ext}`;
          let k = 2;
          while (used.has(name)) name = `${o.base}_${k++}.${o.ext}`;
          used.add(name);
          zip.file(name, asBuf(o.data));
        } catch (e) { skipped.push(`${id}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (skipped.length) zip.file("KHONG-XUAT-DUOC.txt", "Các học liệu sau bị bỏ qua:\n" + skipped.join("\n"));
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      return new NextResponse(new Uint8Array(buf), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="hoc-lieu-vietanh-${ids.length - skipped.length}-file.zip"` },
      });
    }
    // ── Tải LẺ như cũ ──
    const assetId = req.nextUrl.searchParams.get("assetId") || "";
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) return NextResponse.json({ error: "Không tìm thấy tài nguyên" }, { status: 404 });
    const o = await buildExport(db, asset, req.nextUrl.searchParams.get("variant"));
    return new NextResponse(new Uint8Array(asBuf(o.data)), {
      headers: { "Content-Type": o.mime, "Content-Disposition": `attachment; filename="${o.base}.${o.ext}"` },
    });
  } catch (e) {
    return NextResponse.json({ error: "Xuất thất bại: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
