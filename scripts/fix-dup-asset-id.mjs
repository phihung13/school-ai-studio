// ── Vá sự cố 28/07/2026: hai học liệu cùng id R-0000071 ──────────────────────────────────────────
// Chuyện gì đã xảy ra: bộ đếm id (settings.idSeq.r) TỤT LẠI (VPS boot lại bằng pull-db lấy settings cũ
// trên Supabase) → lượt sinh flashcard 28/07 được cấp lại id R-0000071 vốn đã thuộc về kịch bản video
// TO10-C07-D02 (25/07). Hậu quả:
//   1. Bấm tải/mở flashcard ra KỊCH BẢN VIDEO (app tìm theo id, gặp bản ghi cũ trước).
//   2. Mọi lượt đẩy lên Supabase VỠ CẢ LÔ (Postgres 21000: một lệnh ON CONFLICT chạm 2 dòng cùng khoá)
//      → từ 04:03Z 28/07 không gì được lưu bền nữa; bản ghi video 25/07 trên Supabase cũng bị đè mất.
// Script này dựng lại đúng trạng thái trên Supabase (nguồn boot của VPS):
//   • trả kịch bản video 25/07 về với id MỚI (R-0000074), giữ flashcard ở R-0000071;
//   • đẩy lại 2 học liệu sinh sau khi sync chết (mindmap R-0000072, phiếu R-0000073) + 2 dòng nhật ký;
//   • nâng settings.idSeq.r lên trên mọi id đang dùng để lần boot sau không cấp trùng nữa.
// Nội dung khôi phục nằm ở data/migration/2026-07-28-dup-R-0000071 (lấy từ RAM bản chạy thật trước khi
// nó bị khởi động lại — nơi duy nhất còn kịch bản video 25/07).
// Chạy: node scripts/fix-dup-asset-id.mjs            → CHẠY KHÔ (chỉ in việc sẽ làm)
//       node scripts/fix-dup-asset-id.mjs --write    → ghi thật
// Idempotent: chạy lại lần hai không tạo thêm gì.
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = path.join(process.cwd(), "data", "migration", "2026-07-28-dup-R-0000071");
const NEW_VIDEO_ID = "R-0000074";

// env: đọc .env.local nếu chưa có sẵn trong môi trường
if (!process.env.SUPABASE_URL && fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
}
const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!BASE || !KEY) { console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY"); process.exit(1); }
const REST = `${BASE}/rest/v1/studio_kv`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const readLive = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf-8"));
const get = async (q) => {
  const r = await fetch(`${REST}?${q}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${q} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const upsert = async (rows) => {
  if (!WRITE) return;
  const r = await fetch(`${REST}?on_conflict=collection,id`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`UPSERT → ${r.status} ${(await r.text()).slice(0, 300)}`);
};

const assets = await get("collection=eq.assets&select=id,ord,j&limit=5000");
const have = new Map(assets.map((r) => [r.id, r.j]));
let ord = Math.max(...assets.map((r) => r.ord)) + 1;
const rows = [];
const plan = [];

// 1. Kịch bản video 25/07 → id mới (chỉ khi chưa có)
if (have.has(NEW_VIDEO_ID)) plan.push(`bỏ qua: ${NEW_VIDEO_ID} đã có trên Supabase`);
else {
  const a = readLive("live-R-0000071-video.json").asset;
  if (a.format !== "video") throw new Error("File khôi phục không phải kịch bản video — dừng");
  rows.push({ collection: "assets", id: NEW_VIDEO_ID, ord: ord++, j: { ...a, id: NEW_VIDEO_ID } });
  plan.push(`thêm ${NEW_VIDEO_ID} = video ${a.packageId} (vốn là R-0000071 ngày 25/07)`);
}

// 2. Hai học liệu sinh sau khi sync chết
for (const [id, file] of [["R-0000072", "live-R-0000072.json"], ["R-0000073", "live-R-0000073.json"]]) {
  if (have.has(id)) { plan.push(`bỏ qua: ${id} đã có trên Supabase`); continue; }
  const a = readLive(file).asset;
  if (a.id !== id) throw new Error(`File ${file} chứa id ${a.id} ≠ ${id}`);
  rows.push({ collection: "assets", id, ord: ord++, j: a });
  plan.push(`thêm ${id} = ${a.format} ${a.packageId}`);
}

// 3. Kiểm chứng R-0000071 trên Supabase đúng là flashcard (bản người dùng vừa tạo)
const cur71 = have.get("R-0000071");
plan.push(`R-0000071 trên Supabase hiện là: ${cur71 ? `${cur71.format} · ${cur71.packageId} · ${cur71.createdAt}` : "KHÔNG CÓ (!)"}`);

// 4. Nhật ký hoạt động chưa kịp đẩy (2 dòng của 28/07)
const supaAct = new Set((await get("collection=eq.activity&select=id&limit=5000")).map((r) => r.id));
const liveAct = readLive("live-activity.json").activity || [];
const missAct = liveAct.filter((a) => !supaAct.has(a.id));
let actOrd = -1;
for (const a of missAct.slice().reverse()) { // cũ trước, mới nhất nhận ord nhỏ nhất (loadAll xếp tăng dần = mới trước)
  rows.push({ collection: "activity", id: a.id, ord: actOrd--, j: a });
  plan.push(`thêm nhật ký ${a.at} — ${a.action} ${a.target}`);
}

// 5. Nâng bộ đếm id vượt mọi id đang dùng
const maxR = Math.max(...[...have.keys(), NEW_VIDEO_ID, "R-0000072", "R-0000073"]
  .map((id) => Number(id.match(/^R-(\d{7})$/)?.[1] ?? 0)));
const meta = await get("collection=eq._meta&id=eq.settings&select=ord,j");
if (!meta.length) throw new Error("Không thấy _meta/settings trên Supabase");
const settings = meta[0].j;
const seq = settings.idSeq || (settings.idSeq = { q: 0, e: 0, r: 0 });
if ((seq.r ?? 0) < maxR) {
  plan.push(`nâng idSeq.r: ${seq.r} → ${maxR}`);
  seq.r = maxR;
  rows.push({ collection: "_meta", id: "settings", ord: meta[0].ord ?? 0, j: settings });
} else plan.push(`idSeq.r đã là ${seq.r} (≥ ${maxR}) — giữ nguyên`);

console.log(`${WRITE ? "GHI THẬT" : "CHẠY KHÔ"} — ${rows.length} dòng sẽ ghi:`);
for (const p of plan) console.log(" •", p);
await upsert(rows);
if (WRITE) {
  const after = await get("collection=eq.assets&select=id,j&limit=5000");
  const m = new Map(after.map((r) => [r.id, r.j]));
  for (const id of ["R-0000071", "R-0000072", "R-0000073", NEW_VIDEO_ID]) {
    const j = m.get(id);
    console.log(` ✓ ${id}: ${j ? `${j.format} · ${j.packageId}` : "THIẾU"}`);
  }
  const s = (await get("collection=eq._meta&id=eq.settings&select=j"))[0].j;
  console.log(` ✓ idSeq =`, JSON.stringify(s.idSeq));
  console.log("\nCÒN LẠI: khởi động lại app trên VPS để nó pull-db nạp bản đã vá (RAM bản đang chạy vẫn còn id trùng).");
} else console.log("\nChưa ghi gì. Thêm --write để ghi thật.");
