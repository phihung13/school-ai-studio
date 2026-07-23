// Dev harness: lấy 1 asset slide trong DB → Marp markdown → PNG từng trang để SOI THẨM MỸ.
// Chạy: npm run deck:preview -- <assetId|packageId> [theme] [outDir]
import { DatabaseSync } from "node:sqlite";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { slidesToMarp, type MarpTheme } from "../src/lib/slide-marp";
import type { SlideContentV2 } from "../src/lib/schemas/slide";

const LEVEL_LABEL: Record<number, string> = { 1: "Nhận biết", 2: "Thông hiểu", 3: "Vận dụng", 4: "Vận dụng cao" };

function findChrome(): string | undefined {
  const cands = [
    process.env.CHROME_PATH || "",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return cands.find((p) => p && fs.existsSync(p));
}

async function main() {
  const key = process.argv[2] || "as_7507844c75b5";
  const theme = (process.argv[3] || "va-green") as MarpTheme;
  const outDir = process.argv[4] || path.join(os.tmpdir(), "deck-preview");

  const db = new DatabaseSync(path.join(process.cwd(), "data", "studio.db"));
  const rows = db.prepare("select j from assets").all().map((r) => JSON.parse(String((r as { j: string }).j)));
  const asset = rows.find((a) => a.id === key || (a.packageId === key && a.format === "slide"));
  if (!asset) throw new Error("Không thấy asset " + key);
  const pkg = db.prepare("select j from packages where id = ?").get(asset.packageId) as { j: string } | undefined;
  const p = pkg ? JSON.parse(pkg.j) : { level: 1, atomId: "" };
  const atomRow = db.prepare("select j from tree where id = ?").get(p.atomId) as { j: string } | undefined;
  const atom = atomRow ? JSON.parse(atomRow.j) : { code: asset.packageId, title: "?" };

  const md = slidesToMarp((asset.content as SlideContentV2).slides, {
    code: atom.code, level: p.level, levelLabel: LEVEL_LABEL[p.level] || "?", title: atom.title, theme,
  });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "deck.md"), md, "utf-8");

  const chrome = findChrome();
  const MARP = path.join(process.cwd(), "node_modules", "@marp-team", "marp-cli", "marp-cli.js");
  const TDIR = path.join(process.cwd(), "src", "lib", "templates");
  const fontsFile = path.join(TDIR, "marp-fonts.css");
  const fonts = fs.existsSync(fontsFile) ? fs.readFileSync(fontsFile, "utf-8") + "\n" : "";
  const themeTmp = path.join(outDir, "theme.css");
  fs.writeFileSync(themeTmp, fonts + fs.readFileSync(path.join(TDIR, `marp-${theme}.css`), "utf-8"), "utf-8");
  await promisify(execFile)(process.execPath,
    [MARP, "deck.md", "--no-stdin", "--theme", themeTmp, "--html", "--images", "png", "--image-scale", "1", "-o", path.join(outDir, "s.png")],
    { cwd: outDir, timeout: 120000, env: { ...process.env, CHROME_PATH: chrome, CHROME_NO_SANDBOX: "1" } });

  console.log("OK →", outDir);
  for (const f of fs.readdirSync(outDir).filter((f) => f.endsWith(".png")).sort()) console.log(path.join(outDir, f));
}
main().catch((e) => { console.error(e); process.exit(1); });
