// Làm nóng cache MỘT LẦN lúc server khởi động, để người đăng nhập đầu tiên (sau mỗi lần restart/deploy)
// không phải gánh: (1) getDB() nạp+parse toàn bộ SQLite (chục nghìn dòng) lần đầu, và (2) discover()
// gọi mạng lấy metadata OIDC (Google/Hub) lần đầu. `register()` chạy trước khi server nhận request nào.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDB } = await import("@/lib/store");
  const { providers, discover } = await import("@/lib/oidc");

  const t0 = Date.now();
  const db = getDB();
  console.log(`[boot] DB nạp xong sau ${Date.now() - t0}ms`);

  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  await Promise.all(providers(db).map(async (p) => {
    const t1 = Date.now();
    try {
      await withTimeout(discover(p), 10_000);
      console.log(`[boot] OIDC discovery ${p.id} xong sau ${Date.now() - t1}ms`);
    } catch (e) {
      // Không chặn boot vì nhà cung cấp — cứ để lần đăng nhập thật thử lại (như hành vi cũ).
      console.warn(`[boot] OIDC discovery ${p.id} lỗi lúc khởi động, sẽ thử lại lúc đăng nhập:`, e instanceof Error ? e.message : e);
    }
  }));
}
