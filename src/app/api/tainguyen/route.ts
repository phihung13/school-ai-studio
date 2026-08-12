// Phục vụ tài nguyên NotebookLM trên đĩa (D:\TaiNguyen) cho trang nguyên tử.
//   GET ?kc=KC-xxxxxxx        → manifest JSON (các định dạng × DOK của node)
//   GET ?coverage=1           → bản đồ phủ KC → [định dạng]
//   GET ?file=<rel>           → phát tệp (inline), hỗ trợ Range cho video/audio
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { resourcesForKC, coverage, safeResolve, CONTENT_TYPE, TAINGUYEN_DIR } from "@/lib/tainguyen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const file = sp.get("file");
  const kc = sp.get("kc");

  if (sp.get("coverage") === "1") return NextResponse.json({ coverage: coverage(), dir: TAINGUYEN_DIR });

  if (kc && !file) return NextResponse.json({ kc, resources: resourcesForKC(kc), dir: TAINGUYEN_DIR });

  if (file) {
    const abs = safeResolve(file);
    if (!abs) return NextResponse.json({ error: "Đường dẫn không hợp lệ" }, { status: 400 });
    let st: fs.Stats;
    try { st = fs.statSync(abs); if (!st.isFile()) throw new Error(); }
    catch { return NextResponse.json({ error: "Không tìm thấy tệp" }, { status: 404 }); }

    const ext = abs.slice(abs.lastIndexOf(".") + 1).toLowerCase();
    const type = CONTENT_TYPE[ext] || "application/octet-stream";
    const isMedia = /^(mp4|webm|mov|mp3|m4a|wav|ogg)$/.test(ext);
    const baseHeaders: Record<string, string> = {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=60",
    };

    // Range (tua video/audio) — trả 206 với lát byte yêu cầu
    const range = req.headers.get("range");
    if (isMedia && range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const total = st.size;
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : total - 1;
        if (isNaN(start)) start = 0;
        if (isNaN(end) || end >= total) end = total - 1;
        if (start > end || start >= total) {
          return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
        }
        const len = end - start + 1;
        const buf = Buffer.alloc(len);
        const fd = fs.openSync(abs, "r");
        try { fs.readSync(fd, buf, 0, len, start); } finally { fs.closeSync(fd); }
        return new NextResponse(new Uint8Array(buf), {
          status: 206,
          headers: { ...baseHeaders, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(len) },
        });
      }
    }

    const buf = fs.readFileSync(abs);
    if (isMedia) baseHeaders["Accept-Ranges"] = "bytes";
    return new NextResponse(new Uint8Array(buf), { headers: { ...baseHeaders, "Content-Length": String(st.size) } });
  }

  return NextResponse.json({ error: "Thiếu tham số (kc / file / coverage)" }, { status: 400 });
}
