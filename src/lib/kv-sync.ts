// ── Đồng bộ studio.db → Supabase (bảng studio_kv) ──
// GATE bằng env SUPABASE_URL + SUPABASE_SERVICE_KEY. KHÔNG có env → tắt hoàn toàn (app chạy local SQLite như cũ,
// máy dev không bị ảnh hưởng). Có env → mỗi persist() đẩy dòng ĐỔI/XOÁ lên studio_kv (fire-and-forget: hàng đợi
// gộp, retry nhẹ, flush lúc tiến trình thoát êm). studio.db local là bản làm việc; Supabase là bản BỀN (nguồn boot).
type Row = { collection: string; id: string; ord: number; j: unknown };
type Del = { collection: string; id: string };

const BASE = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
export const KV_SYNC_ON = !!(BASE && KEY);
const REST = KV_SYNC_ON ? `${BASE}/rest/v1/studio_kv` : "";
const H: Record<string, string> = KV_SYNC_ON
  ? { apikey: KEY as string, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }
  : {};

const upQ: Row[] = [];
const delQ: Del[] = [];
let draining = false;

export function mirror(upserts: Row[], deletes: Del[]): void {
  if (!KV_SYNC_ON) return;
  if (upserts.length) upQ.push(...upserts);
  if (deletes.length) delQ.push(...deletes);
  void drain();
}

async function drain(): Promise<void> {
  if (draining || !KV_SYNC_ON) return;
  draining = true;
  try {
    while (upQ.length || delQ.length) {
      if (upQ.length) {
        const batch = upQ.splice(0, 500);
        try {
          const res = await fetch(`${REST}?on_conflict=collection,id`, {
            method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify(batch),
          });
          if (!res.ok) console.error("[kv-sync] upsert", res.status, (await res.text().catch(() => "")).slice(0, 300));
        } catch (e) { console.error("[kv-sync] upsert fetch", e instanceof Error ? e.message : String(e)); }
      }
      if (delQ.length) {
        const batch = delQ.splice(0, 200);
        for (const d of batch) {
          try {
            const res = await fetch(`${REST}?collection=eq.${encodeURIComponent(d.collection)}&id=eq.${encodeURIComponent(d.id)}`, { method: "DELETE", headers: H });
            if (!res.ok) console.error("[kv-sync] delete", res.status);
          } catch (e) { console.error("[kv-sync] delete fetch", e instanceof Error ? e.message : String(e)); }
        }
      }
    }
  } finally { draining = false; }
}

export async function flush(): Promise<void> { if (KV_SYNC_ON) await drain(); }

if (KV_SYNC_ON) {
  const bye = () => { void drain(); };
  process.once("SIGTERM", bye);
  process.once("SIGINT", bye);
  process.once("beforeExit", bye);
}
