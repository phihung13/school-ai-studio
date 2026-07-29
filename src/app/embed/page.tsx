"use client";
// ── Factory khi bị NHÚNG trong School Data Hub ─────────────────────────────────────────────────
// Đây KHÔNG phải trang chủ thường: không sidebar, không nút quay lại — khung điều hướng do Hub vẽ
// ở ngoài iframe, vẽ thêm ở đây là hai lớp điều hướng chồng nhau.
//
// Luồng lấy phiên (Hub quy định):
//   1. trang tự sinh PKCE, verifier CHỈ nằm trong bộ nhớ trang này
//   2. postMessage "embed:ready" kèm code_challenge sang Hub
//   3. Hub gửi lại "embed:token" kèm code  → BẮT BUỘC kiểm event.origin, đây là chốt chống giả mạo
//   4. gửi code + verifier về máy chủ Factory để đổi token (server-to-server với Hub)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { HomeContent } from "@/app/page";
import { PageLoading } from "@/components/ui";

const HUB_ORIGIN = "https://hub.truongvietanh.com";

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

type Trangthai = "dangCho" | "sanSang" | "loi" | "ngoaiHub";

export default function EmbedPage() {
  const [trangThai, setTrangThai] = useState<Trangthai>("dangCho");
  const [loi, setLoi] = useState("");
  const verifierRef = useRef<string>("");   // không đưa vào state: tránh lọt ra React DevTools/log

  // Hub tự chỉnh chiều cao khung theo số này, khỏi cuộn hai lớp
  const baoChieuCao = useCallback(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "embed:resize", height: document.body.scrollHeight }, HUB_ORIGIN);
  }, []);

  useEffect(() => {
    let huy = false;

    // Đã có phiên sẵn (mở lại trong cùng khung) thì khỏi xin mã mới
    fetch("/api/data?view=me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (!huy && d.user) setTrangThai("sanSang"); })
      .catch(() => {});

    const nhan = async (event: MessageEvent) => {
      // CHỐT CHẶN: chỉ nghe Hub. Bỏ qua im lặng mọi nguồn khác, không phản hồi, không log ra console
      // (log ra là mách cho kẻ dò biết trang này đang chờ gì).
      if (event.origin !== HUB_ORIGIN) return;
      const data = event.data as { type?: string; code?: string };
      if (data?.type !== "embed:token" || !data.code || !verifierRef.current) return;
      try {
        const r = await fetch("/api/auth/embed", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ code: data.code, codeVerifier: verifierRef.current }),
        });
        const j = await r.json();
        verifierRef.current = "";                       // dùng một lần rồi bỏ
        if (!r.ok) throw new Error(j.error || "Không đổi được mã");
        if (!huy) { setTrangThai("sanSang"); setTimeout(baoChieuCao, 300); }
      } catch (e) {
        if (!huy) { setLoi(e instanceof Error ? e.message : "Lỗi không rõ"); setTrangThai("loi"); }
      }
    };
    window.addEventListener("message", nhan);

    // Mở thẳng địa chỉ này ngoài Hub: không có cửa sổ cha để nói chuyện → nói rõ, đừng treo mãi.
    if (window.parent === window) setTrangThai((cu) => (cu === "sanSang" ? cu : "ngoaiHub"));
    else newPkce().then(({ verifier, challenge }) => {
      if (huy) return;
      verifierRef.current = verifier;
      window.parent.postMessage({ type: "embed:ready", codeChallenge: challenge }, HUB_ORIGIN);
    });

    return () => { huy = true; window.removeEventListener("message", nhan); };
  }, [baoChieuCao]);

  useEffect(() => {
    if (trangThai !== "sanSang") return;
    baoChieuCao();
    const ro = new ResizeObserver(baoChieuCao);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [trangThai, baoChieuCao]);

  if (trangThai === "sanSang") return <main className="p-4 lg:p-6"><HomeContent /></main>;

  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      {trangThai === "dangCho" && <PageLoading />}
      {trangThai === "ngoaiHub" && (
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-ink">Trang này dành cho khung nhúng</p>
          <p className="mt-1 text-sm text-ink-2">Mở Học liệu Việt Anh từ trang chủ Hub, hoặc vào thẳng <a href="/" className="text-brand underline decoration-dotted underline-offset-2">factory.vietanh.org</a>.</p>
        </div>
      )}
      {trangThai === "loi" && (
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-danger">Chưa vào được</p>
          <p className="mt-1 text-sm text-ink-2">{loi}</p>
        </div>
      )}
    </main>
  );
}
