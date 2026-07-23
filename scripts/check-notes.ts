// Dev check: xuất PPTX qua renderMarpDeck rồi đọc ngược notesSlide để xác nhận ghi chú giảng dạy
// thật sự nằm trong file (Marp không tự mang notes vào PPTX — ta tiêm vào gói OOXML).
import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { slidesToMarp, renderMarpDeck } from "../src/lib/slide-marp";
import type { SlideContentV2 } from "../src/lib/schemas/slide";

async function main() {
  const key = process.argv[2] || "as_7507844c75b5";
  const db = new DatabaseSync(path.join(process.cwd(), "data", "studio.db"));
  const asset = db.prepare("select j from assets").all()
    .map((r) => JSON.parse(String((r as { j: string }).j)))
    .find((a) => a.id === key);
  const slides = (asset.content as SlideContentV2).slides;
  const md = slidesToMarp(slides, { code: "TO07-C01-A01", level: 1, levelLabel: "Nhận biết", title: "x", theme: "va-green" });
  const buf = await renderMarpDeck(md, "va-green", "pptx", slides.map((s) => s.notes));
  if (!buf) throw new Error("renderMarpDeck trả null");
  fs.writeFileSync(path.join(process.argv[3] || ".", "check.pptx"), buf);

  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < slides.length; i++) {
    const f = zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`);
    const xml = f ? await f.async("string") : "";
    const text = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((m) => m[1]).join(" | ");
    console.log(`slide ${i + 1}: notes trong file = ${text || "(trống)"}`);
    console.log(`          notes gốc trong DB   = ${slides[i].notes || "(không có)"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
