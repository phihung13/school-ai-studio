// ── Đẩy học liệu Chuẩn trường sang app Gia sư (Việt Anh Personal Tutor) ──
// Spec: docs/studio-export-to-tutor.md. Luồng: dựng file tự chứa (buildExport của /api/export)
// → upload bucket `learning-assets` của Supabase tutor → POST import-kg khuôn va.kg-bundle/2.2
// (id ổn định = assetId nên đẩy lại là ĐÈ, không nhân bản; uri = đường dẫn trong bucket).
import { DB, node, ancestors } from "./store";
import type { AssetFormat } from "./shared";
import { buildExport } from "@/app/api/export/route";

// Mặc định theo spec Hùng cấp 2026-07-15 — đổi được trong Cài đặt nếu tutor dời host/key.
const DEFAULT_TUTOR_URL = "https://gxbxsdhvtwtjkfygetzb.supabase.co";
const DEFAULT_TUTOR_APIKEY = "sb_publishable_BYthnvkNq8azqs_Xr-P_8w_itKKV-UQ";
const BUCKET = "learning-assets";

export interface TutorConfig { url: string; apikey: string; email?: string; password?: string; jwt?: string }
export function tutorConfig(db: DB): TutorConfig {
  const s = db.settings;
  return {
    url: (s.tutorUrl || DEFAULT_TUTOR_URL).replace(/\/+$/, ""),
    apikey: s.tutorApikey || DEFAULT_TUTOR_APIKEY,
    email: s.tutorEmail, password: s.tutorPassword, jwt: s.tutorJwt,
  };
}
export function tutorConfigured(db: DB): boolean {
  const c = tutorConfig(db);
  return !!(c.jwt || (c.email && c.password));
}

// enum môn của tutor (xác nhận 16/07): Toan | Hoa | Anh | Van — map từ tên môn trong cây Studio.
// Môn ngoài 4 tên này không đẩy được; môn chưa published bên tutor sẽ trả 409 khi đẩy.
export function tutorSubjectOf(title: string): "Toan" | "Hoa" | "Anh" | "Van" | null {
  const t = title.toLowerCase();
  if (/toán/.test(t)) return "Toan";
  if (/hóa|hoá/.test(t)) return "Hoa";
  if (/tiếng anh|anh văn|english/.test(t)) return "Anh";
  if (/ngữ văn|tiếng việt|(^|[^h] )văn/.test(t)) return "Van";
  return null;
}

// Định dạng Studio → (biến thể file xuất, format tutor). video = storyboard chữ, không phải video
// thật cho học sinh → không đẩy.
const PUSH_PLAN: Partial<Record<AssetFormat, { variant: string | null; tutorFormat: string }>> = {
  quiz: { variant: "html", tutorFormat: "quiz" },
  flashcard: { variant: "html", tutorFormat: "flashcard" },
  slide: { variant: "html", tutorFormat: "slide" },
  podcast: { variant: "html", tutorFormat: "podcast" }, // HTML kèm MP3 nhúng — mở là nghe được
  mindmap: { variant: null, tutorFormat: "mindmap" },
  text: { variant: null, tutorFormat: "text" },          // PDF (Typst); thiếu binary → DOCX vẫn tải được
  worksheet: { variant: null, tutorFormat: "worksheet" },
};

// ── JWT: dùng bản dán sẵn, hoặc đăng nhập Supabase bằng email+mật khẩu (cache tới gần hạn) ──
let tokenCache: { key: string; token: string; exp: number } | null = null;
async function tutorJwt(cfg: TutorConfig): Promise<string> {
  if (cfg.jwt) return cfg.jwt;
  if (!cfg.email || !cfg.password) throw new Error("Chưa cấu hình tài khoản tutor — vào Cài đặt → Phong cách & chi phí → Kết nối app Gia sư");
  const key = `${cfg.url}|${cfg.email}`;
  if (tokenCache && tokenCache.key === key && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.apikey },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; msg?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`Đăng nhập tutor thất bại (${res.status}): ${j.error_description || j.msg || j.error || "sai email/mật khẩu?"}`);
  tokenCache = { key, token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000 };
  return j.access_token;
}
export function clearTutorToken(): void { tokenCache = null; }

// kiểm tra kết nối: lấy được JWT là coi như thông (quyền bucket/import kiểm chứng khi đẩy thật)
export async function tutorTest(db: DB): Promise<{ ok: boolean; message: string }> {
  const cfg = tutorConfig(db);
  try {
    clearTutorToken();
    const jwt = await tutorJwt(cfg);
    return { ok: true, message: cfg.jwt ? "Đang dùng JWT dán sẵn." : `Đăng nhập OK — nhận được token (…${jwt.slice(-6)}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// Bucket KHÔNG public (chủ ý phía tutor): uri trong bundle là ĐƯỜNG DẪN TRONG BUCKET
// (vd studio/TO10-C03-B04/as_x.html) — tutor tự ký signed URL mỗi lần học sinh mở.
async function uploadToBucket(cfg: TutorConfig, jwt: string, path: string, data: Buffer, mime: string): Promise<string> {
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: cfg.apikey, Authorization: `Bearer ${jwt}`, "Content-Type": mime, "x-upsert": "true" },
    body: new Uint8Array(data),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 403 || res.status === 401) throw new Error(`Không có quyền upload bucket ${BUCKET} (${res.status}) — policy teacher chỉ mở cho prefix studio/*. ${t.slice(0, 200)}`);
    throw new Error(`Upload thất bại (${res.status}): ${t.slice(0, 200)}`);
  }
  return path;
}

export interface PushResult { id: string; code: string; format: AssetFormat; ok: boolean; msg: string; uri?: string }

// ── Đẩy một loạt asset: dựng file → upload → gom bundle theo MÔN → POST import-kg ──
export async function pushAssets(db: DB, ids: string[]): Promise<{ results: PushResult[]; pushed: number }> {
  const cfg = tutorConfig(db);
  const jwt = await tutorJwt(cfg);
  const results: PushResult[] = [];
  // resource chờ gửi, gom theo môn tutor (mỗi môn một bundle/POST)
  const bySubject = new Map<string, { resource: Record<string, unknown>; r: PushResult }[]>();

  for (const id of [...new Set(ids)]) {
    const asset = db.assets.find((a) => a.id === id);
    if (!asset) { results.push({ id, code: "?", format: "text", ok: false, msg: "Không tồn tại" }); continue; }
    const pkg = db.packages.find((p) => p.id === asset.packageId);
    const atom = pkg ? node(db, pkg.atomId) : undefined;
    const r: PushResult = { id, code: atom?.code || "?", format: asset.format, ok: false, msg: "" };
    results.push(r);
    if (!pkg || !atom) { r.msg = "Thiếu gói/nguyên tử gốc"; continue; }
    if (pkg.status !== "approved") { r.msg = "Gói chưa Chuẩn trường — tutor chỉ nhận nội dung đã duyệt"; continue; }
    if (asset.status !== "ready") { r.msg = `Học liệu đang ở trạng thái "${asset.status}" — chỉ đẩy bản sẵn sàng`; continue; }
    const plan = PUSH_PLAN[asset.format];
    if (!plan) { r.msg = "Định dạng này không đẩy được (video là storyboard, chưa phải video thật)"; continue; }
    const subjTitle = [...ancestors(db, atom.id)].find((n) => n.kind === "subject")?.title || "";
    const subject = tutorSubjectOf(subjTitle);
    if (!subject) { r.msg = `Môn "${subjTitle}" chưa có trên tutor (chỉ Toán · Hóa · Tiếng Anh · Văn)`; continue; }

    // dựng file + upload lấy uri công khai
    let uri: string;
    try {
      const built = await buildExport(db, asset, plan.variant);
      const buf = typeof built.data === "string" ? Buffer.from(built.data, "utf-8") : built.data;
      // đường dẫn ỔN ĐỊNH theo assetId → đẩy lại là đè file cũ, link không đổi
      const safeCode = atom.code.replace(/[^a-zA-Z0-9._-]/g, "-");
      uri = await uploadToBucket(cfg, jwt, `studio/${safeCode}/${asset.id}.${built.ext}`, buf, built.mime.split(";")[0]);
      r.uri = uri;
    } catch (e) { r.msg = e instanceof Error ? e.message : String(e); continue; }

    const list = bySubject.get(subject) || [];
    list.push({
      r,
      resource: {
        id: asset.id,                 // ỔN ĐỊNH (R-…) — gửi lại cùng id = đè
        node_id: atom.id,             // = KC — trùng node_key tutor SAU re-key ID (P3). (Trước re-key tutor dùng mã vị trí.)
        format: plan.tutorFormat,
        tier: pkg.level,
        uri,
      },
    });
    bySubject.set(subject, list);
  }

  // ── POST import-kg từng môn ──
  for (const [subject, items] of bySubject) {
    let ok = false, msg = "";
    try {
      const res = await fetch(`${cfg.url}/functions/v1/import-kg`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.apikey, Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ schema: "va.kg-bundle/2.2", subject, version_label: "studio-export", resources: items.map((x) => x.resource) }),
      });
      const text = await res.text().catch(() => "");
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text); } catch { /* giữ text thô */ }
      if (res.ok) { ok = true; msg = `Đã nhận (${subject})`; }
      else if (res.status === 409) msg = `Môn ${subject} chưa published bên tutor (409)`;
      else if (res.status === 422) msg = `Sai chuẩn (422): ${JSON.stringify(j.issues ?? j).slice(0, 500)}`;
      else if (res.status === 401 || res.status === 403) msg = `JWT/quyền không hợp lệ (${res.status})`;
      else msg = `Lỗi ${res.status}: ${text.slice(0, 300)}`;
    } catch (e) { msg = "Không gọi được import-kg: " + (e instanceof Error ? e.message : String(e)); }
    for (const { r } of items) { r.ok = ok; r.msg = msg; }
  }

  return { results, pushed: results.filter((r) => r.ok).length };
}
