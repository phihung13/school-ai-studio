"use client";
import { useEffect } from "react";

const CHUNK_RE = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i;

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunk = CHUNK_RE.test(error?.message || "");
  useEffect(() => {
    if (!isChunk) return;
    try {
      const k = "va_chunk_reload_at";
      const last = Number(sessionStorage.getItem(k) || 0);
      if (Date.now() - last > 8000) { sessionStorage.setItem(k, String(Date.now())); window.location.reload(); }
    } catch { window.location.reload(); }
  }, [isChunk]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-warn-bg text-2xl text-warn">⚠</span>
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">{isChunk ? "Đang cập nhật bản mới…" : "Trang gặp trục trặc"}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">{isChunk ? "Có bản cập nhật — hệ thống đang tự tải lại. Nếu đợi lâu, bấm Tải lại." : "Một lỗi bất ngờ xảy ra khi hiển thị trang. Thử lại thường là xong."}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => window.location.reload()} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">Tải lại</button>
        <button onClick={() => reset()} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2">Thử lại</button>
      </div>
    </div>
  );
}
