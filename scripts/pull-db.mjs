// ── Boot: dựng lại data/studio.db TỪ Supabase (studio_kv) trước khi `next start` ──
// GATE bằng env SUPABASE_URL + SUPABASE_SERVICE_KEY. KHÔNG có env → không làm gì (dùng studio.db local sẵn có).
// Có env → tải toàn bộ studio_kv, ghi đè studio.db (Supabase là nguồn chân lý). VPS nhờ đó STATELESS (không cần seed DB).
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!BASE || !KEY) { console.log("[pull-db] Không có SUPABASE env → dùng studio.db local (bỏ qua)."); process.exit(0); }

const REST = `${BASE}/rest/v1/studio_kv`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const DB_FILE = process.env.STUDIO_DB ? path.resolve(process.env.STUDIO_DB) : path.join(process.cwd(), "data", "studio.db");
const TABLE = { users: "users", tree: "tree", edges: "edges", packages: "packages", assets: "assets",
  reviews: "reviews", jobs: "jobs", proposals: "proposals", activity: "activity", cardStates: "card_states", questions: "questions", ladders: "ladders",
  identityLinks: "identity_links" };
const COLLS = Object.keys(TABLE);

async function pullAll() {
  const sel = "select=collection,id,ord,j&order=collection,id";
  const page = 1000;
  const fail = async (r) => { console.error("[pull-db] lỗi", r.status, (await r.text().catch(() => "")).slice(0, 300)); process.exit(1); };
  // Trang ĐẦU kèm Prefer:count=exact → biết TỔNG số dòng (Content-Range), để bắn các trang còn lại SONG SONG
  // thay vì tuần tự (34.917 dòng ≈ 35 lượt round-trip tới ap-southeast-1 → boot nhanh hơn nhiều lần).
  const first = await fetch(`${REST}?${sel}&limit=${page}&offset=0`, { headers: { ...H, Prefer: "count=exact" } });
  if (!first.ok) await fail(first);
  const out = await first.json();
  const total = Number(first.headers.get("content-range")?.split("/")[1]) || out.length;
  if (out.length >= total) return out;

  const offs = []; for (let o = page; o < total; o += page) offs.push(o);
  const pages = new Array(offs.length);
  let idx = 0;
  const CONC = 8; // giới hạn đồng thời — nhanh mà không quá tải PostgREST
  const worker = async () => {
    while (idx < offs.length) {
      const my = idx++;
      const r = await fetch(`${REST}?${sel}&limit=${page}&offset=${offs[my]}`, { headers: H });
      if (!r.ok) await fail(r);
      pages[my] = await r.json();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, offs.length) }, worker));
  for (const p of pages) out.push(...p); // giữ đúng thứ tự (order by collection,id + offset tăng dần)
  return out;
}

const rows = await pullAll();
console.log(`[pull-db] Tải ${rows.length} dòng từ studio_kv → ${DB_FILE}`);

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
for (const suf of ["", "-wal", "-shm"]) fs.rmSync(DB_FILE + suf, { force: true }); // dựng mới hoàn toàn từ Supabase
const c = new DatabaseSync(DB_FILE);
c.exec("PRAGMA journal_mode = WAL");
for (const coll of COLLS) c.exec(`CREATE TABLE IF NOT EXISTS ${TABLE[coll]} (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, j TEXT NOT NULL)`);
c.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
c.exec("BEGIN");
const stmt = {}; for (const coll of COLLS) stmt[coll] = c.prepare(`INSERT OR REPLACE INTO ${TABLE[coll]} (id, ord, j) VALUES (?, ?, ?)`);
const kvst = c.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)");
let nColl = 0, nKv = 0;
for (const r of rows) {
  if (r.collection === "_meta") { kvst.run(r.id, JSON.stringify(r.j)); nKv++; }
  else if (stmt[r.collection]) { stmt[r.collection].run(r.id, r.ord ?? 0, JSON.stringify(r.j)); nColl++; }
}
c.exec("COMMIT");
c.close();
console.log(`[pull-db] Xong: ${nColl} bản ghi + ${nKv} kv. studio.db đã dựng lại từ Supabase.`);
