// Xem trước slide REALTIME bằng CHÍNH theme thật — render markdown Marp → HTML+CSS in-process
// (marp-core, KHÔNG cần Chrome, ~vài trăm ms) rồi trả 1 trang tự chứa để nhúng iframe.
// Nhờ vậy bản xem trên web KHỚP y hệt file PPTX/PDF tải về, và đổi mẫu là đổi ngay.
import { NextRequest, NextResponse } from "next/server";
import { getDB, node, LEVEL_LABEL } from "@/lib/store";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { slidesToMarp } from "@/lib/slide-marp";
import { SLIDE_TEMPLATES } from "@/lib/shared";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return new NextResponse("Chưa đăng nhập", { status: 401 });

  const sp = req.nextUrl.searchParams;
  const db = getDB();
  const asset = db.assets.find((a) => a.id === (sp.get("assetId") || ""));
  if (!asset || asset.format !== "slide") return new NextResponse("Không thấy slide", { status: 404 });
  const pkg = db.packages.find((p) => p.id === asset.packageId);
  const atom = pkg ? node(db, pkg.atomId) : null;
  if (!pkg || !atom) return new NextResponse("Thiếu gói/nguyên tử", { status: 404 });

  const themeId = SLIDE_TEMPLATES.find((t) => t.id === sp.get("theme"))?.id ?? "va-green";
  const i = Math.max(0, parseInt(sp.get("i") || "0", 10) || 0);
  const slides = (asset.content as { slides: unknown[] }).slides || [];
  if (!slides.length) return new NextResponse("Slide rỗng", { status: 404 });

  const md = slidesToMarp(slides as Parameters<typeof slidesToMarp>[0], {
    code: atom.code, level: pkg.level, levelLabel: LEVEL_LABEL[pkg.level], title: atom.title, theme: themeId,
  });

  const T = path.join(process.cwd(), "src", "lib", "templates");
  const fontsFile = path.join(T, "marp-fonts.css");
  const fonts = fs.existsSync(fontsFile) ? fs.readFileSync(fontsFile, "utf-8") + "\n" : "";
  const themeFile = path.join(T, `marp-${themeId}.css`);
  if (!fs.existsSync(themeFile)) return new NextResponse("Không có mẫu", { status: 404 });

  const { Marp } = await import("@marp-team/marp-core");
  const marp = new Marp({ html: true });        // html:true — slide của ta là HTML thuần, không được escape
  marp.themeSet.add(fonts + fs.readFileSync(themeFile, "utf-8"));
  const { html, css } = marp.render(md);

  // Mỗi slide là 1 <svg viewBox="0 0 1280 720"> tự co giãn. Chỉ hiện slide thứ i; đổi slide qua postMessage
  // (không tải lại) cho mượt; đổi MẪU thì client remount iframe (tải lại) để lấy CSS mới.
  const doc = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>${css}</style>
<style id="only"></style>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  .marpit{margin:0;padding:0}
  svg[data-marpit-svg]{width:100%;height:auto;display:block}
</style>
<script>
  function show(n){document.getElementById('only').textContent =
    'svg[data-marpit-svg]{display:none!important}svg[data-marpit-svg]:nth-of-type('+(n+1)+'){display:block!important}';}
  show(${i});
  addEventListener('message',function(e){ if(e.data&&e.data.t==='slide') show(e.data.i|0); });
</script></head><body>${html}</body></html>`;

  return new NextResponse(doc, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
