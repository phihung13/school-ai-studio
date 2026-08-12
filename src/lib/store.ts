import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";
import { mirror, KV_SYNC_ON } from "./kv-sync";
import type { User, TreeNode, Edge, Pkg, Asset, Review, Job, Proposal, Activity, Settings, OutlineNode, CardState, Question, Ladder, IdentityLink, Comment, TnAsset } from "./shared";

export * from "./shared";

export interface DB {
  users: User[]; tree: TreeNode[]; edges: Edge[]; packages: Pkg[]; assets: Asset[];
  reviews: Review[]; jobs: Job[]; proposals: Proposal[]; activity: Activity[]; settings: Settings;
  cardStates: CardState[]; questions: Question[]; ladders: Ladder[]; identityLinks: IdentityLink[];
  comments: Comment[]; tainguyen: TnAsset[];
  secret: string;
}

// ===== Store: SQLite (WAL) =====
// Vì sao bỏ db.json: file JSON được nạp NGUYÊN KHỐI rồi GHI ĐÈ NGUYÊN KHỐI mỗi lần sửa. Hai tiến trình
// cùng ghi (app + con Claude của giáo viên qua MCP) là mất dữ liệu im lặng: cả hai cùng đọc, cả hai cùng
// sửa, người ghi sau xoá sạch việc của người ghi trước. SQLite ghi theo DÒNG trong một transaction:
// A sửa nguyên tử X, B sửa nguyên tử Y → cả hai còn. Chỉ khi hai bên sửa CÙNG một dòng mới có người
// thắng — đó là xung đột thật, không phải tai nạn.
//
// Mỗi collection = một bảng (id, ord, j): `j` là JSON của cả bản ghi, `ord` giữ đúng thứ tự mảng như
// file JSON cũ (nhật ký hoạt động dựa vào thứ tự này). Hình dạng dữ liệu trong RAM giữ nguyên, nên toàn
// bộ code còn lại — kể cả heatmap O(n) — chạy y hệt.
const DATA_DIR = path.join(process.cwd(), "data");
// Mặc định data/studio.db; cho phép trỏ DB khác qua STUDIO_DB (dùng khi verify di trú, không đụng bản chạy thật).
const DB_FILE = process.env.STUDIO_DB ? path.resolve(process.env.STUDIO_DB) : path.join(DATA_DIR, "studio.db");
const LEGACY_JSON = path.join(DATA_DIR, "db.json"); // giữ nguyên làm bản sao lưu, không bao giờ ghi lại

type Coll = "users" | "tree" | "edges" | "packages" | "assets" | "reviews" | "jobs" | "proposals" | "activity" | "cardStates" | "questions" | "ladders" | "identityLinks" | "comments" | "tainguyen";
const COLLS: Coll[] = ["users", "tree", "edges", "packages", "assets", "reviews", "jobs", "proposals", "activity", "cardStates", "questions", "ladders", "identityLinks", "comments", "tainguyen"];
const TABLE: Record<Coll, string> = {
  users: "users", tree: "tree", edges: "edges", packages: "packages", assets: "assets",
  reviews: "reviews", jobs: "jobs", proposals: "proposals", activity: "activity", cardStates: "card_states",
  questions: "questions", ladders: "ladders", identityLinks: "identity_links", comments: "comments", tainguyen: "tainguyen",
};
const ID_PREFIX: Record<Coll, string> = {
  users: "u", tree: "n", edges: "e", packages: "p", assets: "a",
  reviews: "r", jobs: "j", proposals: "pr", activity: "act", cardStates: "cs", questions: "q", ladders: "l", identityLinks: "il", comments: "cm", tainguyen: "tn",
};

let conn: DatabaseSync | null = null;
let cache: DB | null = null;
let cacheVersion = -1; // PRAGMA data_version lúc nạp — kết nối khác commit thì số này đổi → nạp lại
// id → "ord json" của bản ghi lúc nạp. persist() so với đây để biết dòng nào THẬT SỰ đổi.
let baseline: Map<Coll, Map<string, string>> = new Map();
let kvBaseline: Map<string, string> = new Map();

export function uid(prefix = ""): string {
  return prefix + crypto.randomBytes(6).toString("hex");
}

export function nowIso(): string { return new Date().toISOString(); }

function connect(): DatabaseSync {
  if (conn) return conn;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const c = new DatabaseSync(DB_FILE);
  c.exec("PRAGMA journal_mode = WAL");   // nhiều tiến trình đọc song song trong lúc một tiến trình ghi
  c.exec("PRAGMA synchronous = NORMAL");
  c.exec("PRAGMA busy_timeout = 5000");  // đụng khoá thì chờ, không ném lỗi ngay
  for (const coll of COLLS) {
    c.exec(`CREATE TABLE IF NOT EXISTS ${TABLE[coll]} (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, j TEXT NOT NULL)`);
  }
  c.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  conn = c;
  bootstrap(c);
  return c;
}

// data_version chỉ tăng khi một KẾT NỐI KHÁC commit — ghi của chính mình không làm nó đổi.
function dataVersion(c: DatabaseSync): number {
  const row = c.prepare("PRAGMA data_version").get() as { data_version?: number } | undefined;
  return row?.data_version ?? 0;
}

// DB rỗng: nạp từ db.json cũ nếu có, không thì dựng cây tri thức từ data/import.
function bootstrap(c: DatabaseSync): void {
  if (c.prepare("SELECT v FROM kv WHERE k = 'bootstrapped'").get()) return;
  let seed: DB;
  if (fs.existsSync(LEGACY_JSON)) {
    seed = JSON.parse(fs.readFileSync(LEGACY_JSON, "utf-8")) as DB;
  } else {
    // Lazy import to avoid cycle: kb-seed nạp cây tri thức thật từ data/import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildSeed } = require("./kb-seed") as typeof import("./kb-seed");
    seed = buildSeed();
  }
  normalize(seed);
  c.exec("BEGIN IMMEDIATE");
  try {
    for (const coll of COLLS) {
      const stmt = c.prepare(`INSERT OR REPLACE INTO ${TABLE[coll]} (id, ord, j) VALUES (?, ?, ?)`);
      (seed[coll] as { id: string }[]).forEach((item, i) => stmt.run(item.id, i, JSON.stringify(item)));
    }
    const kv = c.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)");
    kv.run("settings", JSON.stringify(seed.settings));
    kv.run("secret", JSON.stringify(seed.secret));
    kv.run("bootstrapped", JSON.stringify(nowIso()));
    c.exec("COMMIT");
  } catch (e) {
    c.exec("ROLLBACK");
    throw e;
  }
}

// Vá dữ liệu cũ: job theo schema trước Xưởng sản xuất, cardStates chưa có, nhật ký hoạt động chưa có id.
function normalize(db: DB): void {
  if (!Array.isArray(db.cardStates)) db.cardStates = [];
  if (!Array.isArray(db.questions)) db.questions = [];
  if (!Array.isArray(db.ladders)) db.ladders = [];
  if (!Array.isArray(db.identityLinks)) db.identityLinks = [];
  if (Array.isArray(db.jobs)) db.jobs = db.jobs.filter((j) => Array.isArray((j as { tasks?: unknown }).tasks));
  for (const coll of COLLS) {
    const arr = db[coll] as { id?: string }[] | undefined;
    if (!Array.isArray(arr)) { (db[coll] as unknown) = []; continue; }
    for (const item of arr) if (!item.id) item.id = uid(ID_PREFIX[coll]);
  }
}

function loadAll(c: DatabaseSync): DB {
  const version = dataVersion(c);
  const db = {} as DB;
  baseline = new Map();
  for (const coll of COLLS) {
    const rows = c.prepare(`SELECT id, ord, j FROM ${TABLE[coll]} ORDER BY ord`).all() as unknown as { id: string; ord: number; j: string }[];
    const b = new Map<string, string>();
    const arr: unknown[] = [];
    for (const r of rows) {
      b.set(r.id, `${r.ord} ${r.j}`);
      arr.push(JSON.parse(r.j));
    }
    baseline.set(coll, b);
    (db[coll] as unknown) = arr;
  }
  kvBaseline = new Map();
  for (const r of c.prepare("SELECT k, v FROM kv").all() as unknown as { k: string; v: string }[]) kvBaseline.set(r.k, r.v);
  db.settings = JSON.parse(kvBaseline.get("settings") ?? "{}") as Settings;
  db.secret = JSON.parse(kvBaseline.get("secret") ?? '""') as string;
  cacheVersion = version;
  return db;
}

export function getDB(): DB {
  const c = connect();
  // Tiến trình/route khác đã commit → bản trong RAM đã cũ, nạp lại (thay cho phép so mtime của db.json).
  if (cache && dataVersion(c) !== cacheVersion) { cache = null; invalidateTreeIndex(); }
  if (cache) { if (!_nodeById) buildIndexes(cache.tree); return cache; }
  cache = loadAll(c);
  buildIndexes(cache.tree);
  return cache;
}

// ===== Cached indexes (rebuilt on getDB, invalidated on tree mutation) =====
let _nodeById: Map<string, TreeNode> | null = null;
let _childrenByParent: Map<string | null, TreeNode[]> | null = null;

function buildIndexes(tree: TreeNode[]): void {
  _nodeById = new Map();
  _childrenByParent = new Map();
  for (const n of tree) {
    _nodeById.set(n.id, n);
    const arr = _childrenByParent.get(n.parentId);
    if (arr) arr.push(n);
    else _childrenByParent.set(n.parentId, [n]);
  }
  for (const arr of _childrenByParent.values()) arr.sort((a, b) => a.order - b.order);
}

export function invalidateTreeIndex(): void { _nodeById = null; _childrenByParent = null; }

let writing = false;
let pending = false;
// Ghi CHỈ những dòng đã đổi, trong một transaction. Dòng người khác sửa mà mình không đụng thì còn nguyên.
export function persist(): void {
  if (!cache) return;
  if (writing) { pending = true; return; }
  writing = true;
  const c = connect();
  const ups: { collection: string; id: string; ord: number; j: unknown }[] = [];
  const dels: { collection: string; id: string }[] = [];
  try {
    c.exec("BEGIN IMMEDIATE");
    try {
      for (const coll of COLLS) {
        const items = cache[coll] as { id?: string }[];
        const b = baseline.get(coll) ?? new Map<string, string>();
        const upsert = c.prepare(`INSERT INTO ${TABLE[coll]} (id, ord, j) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET ord = excluded.ord, j = excluded.j`);
        const del = c.prepare(`DELETE FROM ${TABLE[coll]} WHERE id = ?`);
        const alive = new Set<string>();
        items.forEach((item, i) => {
          if (!item.id) item.id = uid(ID_PREFIX[coll]); // bản ghi do code cũ tạo mà chưa gán id
          const j = JSON.stringify(item);
          const key = `${i} ${j}`;
          alive.add(item.id);
          if (b.get(item.id) === key) return; // không đổi → không chạm vào đĩa
          upsert.run(item.id, i, j);
          b.set(item.id, key);
          if (KV_SYNC_ON) ups.push({ collection: coll, id: item.id!, ord: i, j: item });
        });
        for (const id of Array.from(b.keys())) {
          if (alive.has(id)) continue;
          del.run(id);
          b.delete(id);
          if (KV_SYNC_ON) dels.push({ collection: coll, id });
        }
        baseline.set(coll, b);
      }
      const kv = c.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
      const settings = JSON.stringify(cache.settings);
      if (kvBaseline.get("settings") !== settings) { kv.run("settings", settings); kvBaseline.set("settings", settings); if (KV_SYNC_ON) ups.push({ collection: "_meta", id: "settings", ord: 0, j: cache.settings }); }
      const secret = JSON.stringify(cache.secret);
      if (kvBaseline.get("secret") !== secret) { kv.run("secret", secret); kvBaseline.set("secret", secret); if (KV_SYNC_ON) ups.push({ collection: "_meta", id: "secret", ord: 0, j: cache.secret }); }
      c.exec("COMMIT");
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
    cacheVersion = dataVersion(c);
    if (KV_SYNC_ON && (ups.length || dels.length)) mirror(ups, dels);
  } finally {
    writing = false;
    if (pending) { pending = false; persist(); }
  }
}

export function logActivity(by: string, action: string, target: string, href?: string): void {
  const db = getDB();
  db.activity.unshift({ id: uid(ID_PREFIX.activity), at: nowIso(), by, action, target, href });
  if (db.activity.length > 300) db.activity.length = 300;
}

// ===== Tree helpers =====
export function children(db: DB, parentId: string | null): TreeNode[] {
  if (_childrenByParent) return _childrenByParent.get(parentId) ?? [];
  return db.tree.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order);
}
export function node(db: DB, id: string): TreeNode | undefined {
  if (_nodeById) return _nodeById.get(id);
  return db.tree.find((n) => n.id === id);
}
export function ancestors(db: DB, id: string): TreeNode[] {
  const out: TreeNode[] = [];
  let cur = node(db, id);
  while (cur && cur.parentId) { cur = node(db, cur.parentId); if (cur) out.unshift(cur); }
  return out;
}
export function atomsOfSubject(db: DB, subjectId: string): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (pid: string) => {
    for (const c of children(db, pid)) {
      if (c.kind === "atom") out.push(c);
      else walk(c.id);
    }
  };
  walk(subjectId);
  return out;
}
// nguyên tử nằm dưới một node BẤT KỲ (chương/bài/điểm/nguyên tử) — dùng cho Xưởng sản xuất
export function atomsUnder(db: DB, nodeId: string): TreeNode[] {
  const n = node(db, nodeId);
  if (!n) return [];
  if (n.kind === "atom") return [n];
  return atomsOfSubject(db, nodeId);
}
export function subjectOf(db: DB, atomId: string): TreeNode | undefined {
  const anc = ancestors(db, atomId);
  const self = node(db, atomId);
  const chain = [...anc, ...(self ? [self] : [])];
  return chain.find((n) => n.kind === "subject");
}

export function pkgOf(db: DB, atomId: string, level: number): Pkg | undefined {
  return db.packages.find((p) => p.atomId === atomId && p.level === level);
}

// ===== Đồ thị tri thức (cạnh nối ngang) =====
export function edgesOf(db: DB, atomId: string): Edge[] {
  return db.edges.filter((e) => e.from === atomId || e.to === atomId);
}
// nguyên tử tiên quyết của atomId (phải nắm trước): cạnh (from) → atomId
export function prerequisitesOf(db: DB, atomId: string): Edge[] {
  return db.edges.filter((e) => e.to === atomId && e.relation === "prerequisite_hard");
}
// remediation: khi hổng atomId → các nguyên tử liên quan hướng vào (tiên quyết + bổ trợ + dễ lẫn), nặng trước
export function remediationFor(db: DB, atomId: string): Edge[] {
  return db.edges.filter((e) => e.to === atomId).sort((a, b) => b.weight - a.weight);
}
// đồ thị con quanh 1 nguyên tử (để vẽ LightRAG): các cạnh chạm atomId + hàng xóm 1 bước
export function egoGraph(db: DB, atomId: string): { edges: Edge[]; nodeIds: string[] } {
  const edges = edgesOf(db, atomId);
  const nodeIds = Array.from(new Set([atomId, ...edges.flatMap((e) => [e.from, e.to])]));
  return { edges, nodeIds };
}

// ── Mindmap CẤU TRÚC: dựng thẳng từ cây thật (không cần AI) — dùng cho Xưởng sản xuất 2.0 ──
// mục cha gần nhất thuộc tầng "chapter" (rơi về "lesson" rồi "subject" nếu cây không đủ sâu)
export function chapterOf(db: DB, atomId: string): TreeNode | undefined {
  const chain = [...ancestors(db, atomId)];
  return chain.find((n) => n.kind === "chapter") || chain.find((n) => n.kind === "lesson") || chain.find((n) => n.kind === "subject");
}
export function subtreeOutline(db: DB, rootId: string): OutlineNode | undefined {
  const root = node(db, rootId);
  if (!root) return undefined;
  const build = (n: TreeNode): OutlineNode => ({ id: n.id, title: n.title, kind: n.kind, children: children(db, n.id).map(build) });
  return build(root);
}
