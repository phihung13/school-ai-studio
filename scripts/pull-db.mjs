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
  reviews: "reviews", jobs: "jobs", proposals: "proposals", activity: "activity", cardStates: "card_states", questions: "questions" };
const COLLS = Object.keys(TABLE);

async function pullAll() {
  const out = []; let off = 0; const page = 1000;
  for (;;) {
    const r = await fetch(`${REST}?select=collection,id,ord,j&order=collection,id&limit=${page}&offset=${off}`, { headers: H });
    if (!r.ok) { console.error("[pull-db] lỗi", r.status, (await r.text().catch(() => "")).slice(0, 300)); process.exit(1); }
    const rows = await r.json(); out.push(...rows);
    if (rows.length < page) break; off += page;
  }
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
