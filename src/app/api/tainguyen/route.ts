// Kho tài nguyên NotebookLM.
//   GET  ?kc=KC-xxxxxxx  → danh sách tài nguyên của nguyên tử (JSON, có content với định dạng inline)
//   GET  ?coverage=1     → bản đồ phủ atomId → [định dạng]
//   GET  ?id=<tn_id>     → URL DÙNG THẲNG cho 1 tài nguyên: định dạng inline trả HTML/text thật
//                          (mở tab mới/nhúng iframe đều ra nội dung), định dạng Drive → 302 sang Drive.
//   POST                 → WEBHOOK nhận tài nguyên đẩy lên (header X-Api-Key, JSON body)
//   DELETE ?id=          → gỡ 1 tài nguyên (đăng nhập + quyền sửa)
import { NextRequest, NextResponse } from "next/server";
import { getDB, persist, uid, nowIso, node, logActivity } from "@/lib/store";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";
import { TN_FORMATS, isInline, listByAtom, coverageMap, driveOpenUrl } from "@/lib/tainguyen";
import type { TnAsset } from "@/lib/shared";

export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) { return NextResponse.json({ error: msg }, { status }); }

// Phát trực tiếp file Drive qua server (không redirect sang Drive) — cần cho <audio>: link
// tải thẳng của Drive không tin cậy cho phát/tua (không luôn hỗ trợ Range, có màn xác nhận quét
// virus với file lớn), nên ta lấy hộ và chuyển tiếp byte + header Range để trình duyệt tua được.
async function streamDrive(driveFileId: string, mimeType: string | undefined, range: string | null) {
  const upstream = await fetch(`https://drive.google.com/uc?export=download&id=${driveFileId}`, {
    headers: range ? { Range: range } : {},
  });
  if (!upstream.ok && upstream.status !== 206) return bad("Không tải được tệp từ Drive", 502);
  const headers = new Headers();
  headers.set("Content-Type", mimeType || upstream.headers.get("content-type") || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  const cl = upstream.headers.get("content-length"); if (cl) headers.set("Content-Length", cl);
  const cr = upstream.headers.get("content-range"); if (cr) headers.set("Content-Range", cr);
  return new NextResponse(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}

export async function GET(req: NextRequest) {
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return bad("Chưa đăng nhập", 401);
  const db = getDB();
  const sp = req.nextUrl.searchParams;

  if (sp.get("coverage") === "1") return NextResponse.json({ coverage: coverageMap(db) });

  const id = sp.get("id");
  if (id) {
    const t = db.tainguyen.find((x) => x.id === id);
    if (!t) return bad("Không tìm thấy", 404);
    if (isInline(t.format)) {
      const type = t.format === "Text" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
      return new NextResponse(t.content || "", { headers: { "Content-Type": type, "Cache-Control": "private, max-age=60" } });
    }
    if (!t.driveFileId) return bad("Thiếu liên kết Drive", 500);
    if (sp.get("stream") === "1") return streamDrive(t.driveFileId, t.mimeType, req.headers.get("range"));
    return NextResponse.redirect(driveOpenUrl(t.driveFileId));
  }

  const kc = sp.get("kc");
  if (kc) return NextResponse.json({ kc, resources: listByAtom(db, kc) });

  return bad("Thiếu tham số (kc / id / coverage)");
}

// Webhook — không dùng cookie phiên (bên đẩy lên là Claude/skill, không có trình duyệt đăng nhập).
// Xác thực bằng khoá riêng (settings.tainguyenApiKey, sinh qua action "tainguyenGenKey").
export async function POST(req: NextRequest) {
  const db = getDB();
  const key = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!db.settings.tainguyenApiKey) return bad("Chưa bật webhook — vào Cài đặt sinh khoá trước", 503);
  if (key !== db.settings.tainguyenApiKey) return bad("Sai khoá webhook (X-Api-Key)", 401);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Body phải là JSON");
  const { atomId, dok, format, name, driveFileId, mimeType, content, uploadedBy } = body as {
    atomId?: string; dok?: number | null; format?: string; name?: string;
    driveFileId?: string; mimeType?: string; content?: string; uploadedBy?: string;
  };

  if (!atomId) return bad("Thiếu atomId (mã KC)");
  const atom = node(db, atomId);
  if (!atom || atom.kind !== "atom") return bad(`Không tìm thấy nguyên tử ${atomId}`, 404);
  if (!format || !TN_FORMATS.includes(format as never)) return bad(`format phải là một trong: ${TN_FORMATS.join(", ")}`);
  if (dok != null && (!Number.isInteger(dok) || dok < 1 || dok > 3)) return bad("dok phải là 1, 2, 3 hoặc null");

  const inline = isInline(format);
  if (inline && !content) return bad(`Định dạng "${format}" cần "content" (nội dung HTML/markdown)`);
  if (!inline && !driveFileId) return bad(`Định dạng "${format}" cần "driveFileId" (tài nguyên nặng trỏ Drive)`);

  // ghi đè nếu đã có đúng (atomId, dok, format) — đẩy lại = cập nhật bản mới, không đẻ trùng
  const existing = db.tainguyen.find((t) => t.atomId === atomId && t.format === format && (t.dok ?? null) === (dok ?? null));
  const rec: TnAsset = {
    id: existing?.id ?? uid("tn_"),
    atomId, dok: dok ?? null, format, name: (name || atom.title).slice(0, 200),
    uploadedAt: nowIso(), uploadedBy: uploadedBy || "Claude",
    ...(inline ? { content: String(content).slice(0, 2_000_000) } : { driveFileId, mimeType }),
  };
  if (existing) Object.assign(existing, rec); else db.tainguyen.push(rec);
  logActivity(rec.uploadedBy, existing ? "cập nhật" : "đẩy lên", `${format} — ${atom.code} (NotebookLM)`, `/atom/${atomId}`);
  persist();
  return NextResponse.json({ ok: true, id: rec.id, updated: !!existing });
}

export async function DELETE(req: NextRequest) {
  const user = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user || user.role === "principal") return bad("Không có quyền", 403);
  const db = getDB();
  const id = req.nextUrl.searchParams.get("id");
  const t = db.tainguyen.find((x) => x.id === id);
  if (!t) return bad("Không tìm thấy", 404);
  db.tainguyen = db.tainguyen.filter((x) => x.id !== id);
  logActivity(user.name, "xoá", `tài nguyên ${t.format} (NotebookLM)`, `/atom/${t.atomId}`);
  persist();
  return NextResponse.json({ ok: true });
}
