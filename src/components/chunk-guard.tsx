"use client";
import { useEffect } from "react";

// Sau khi deploy bản mới, tab đang mở có thể trỏ tới chunk JS cũ (đã bị thay) →
// điều hướng phát sinh "ChunkLoadError". Ở đây bắt lỗi đó và TỰ tải lại đúng 1 lần
// (có khoá chống lặp) để người dùng không phải bấm Reload tay.
const CHUNK_RE = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

function isChunkError(msg?: unknown): boolean {
  return typeof msg === "string" && CHUNK_RE.test(msg);
}

export default function ChunkGuard() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        const k = "va_chunk_reload_at";
        const last = Number(sessionStorage.getItem(k) || 0);
        if (Date.now() - last < 8000) return; // vừa reload xong → tránh lặp vô hạn nếu lỗi thật
        sessionStorage.setItem(k, String(Date.now()));
      } catch { /* ignore */ }
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => {
      const em = (e.error as Error | undefined)?.message;
      if (isChunkError(e.message) || isChunkError(em)) reloadOnce();
    };
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined;
      if (isChunkError(typeof r === "string" ? r : r?.message)) reloadOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
  }, []);
  return null;
}
