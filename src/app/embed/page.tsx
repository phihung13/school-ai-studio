"use client";
// ── Cổng vào khi Factory bị NHÚNG trong School Data Hub ────────────────────────────────────────
//
// Route này CHỈ là CỔNG BẮT TAY: xin phiên xong thì giao lại cho app đầy đủ (trang chủ + sidebar +
// mọi màn hình). Hub vẽ nút thoát ở ngoài khung, còn điều hướng nội bộ vẫn là của Factory — nên
// không có lý do gì dựng một bản Factory rút gọn chỉ có một view.
//
// Luồng lấy phiên (Hub quy định):
//   1. trang tự sinh PKCE, verifier CHỈ nằm trong bộ nhớ trang này
//   2. postMessage "embed:ready" kèm code_challenge sang Hub
//   3. Hub gửi lại "embed:token" kèm code  → BẮT BUỘC kiểm event.origin, đây là chốt chống giả mạo
//   4. gửi code + verifier về máy chủ Factory để đổi token (server-to-server với Hub)
//
// GỬI LẶP, KHÔNG GỬI MỘT PHÁT: bên con không có cách nào biết bên cha đã gắn listener chưa. Bản đầu
// chỉ bắn "embed:ready" đúng một lần lúc mount — đo được là có bắn, đúng target — nhưng Hub gắn
// listener sau đó nên không bao giờ thấy. Giờ nhắc lại đến khi Hub đáp hoặc hết hạn.
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageLoading } from "@/components/ui";

const HUB_ORIGIN = "https://hub.truongvietanh.com";
const NHAC_MOI_MS = 700;   // khoảng cách giữa hai lần nhắc
const NHAC_TOI_DA = 20;    // ~14 giây rồi thôi, đủ cho trang Hub tải xong ngay cả khi mạng chậm

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

type Trangthai = "dangCho" | "sanSang" | "loi" | "ngoaiHub";

export default function EmbedPage() {
  const router = useRouter();
  const [trangThai, setTrangThai] = useState<Trangthai>("dangCho");
  const [loi, setLoi] = useState("");
  const verifierRef = useRef<string>("");   // không đưa vào state: tránh lọt ra React DevTools/log
  const hubDaDapRef = useRef(false);
  // Mã uỷ quyền chỉ dùng được MỘT lần. Đánh dấu ngay khi nhận, TRƯỚC mọi await — nếu chỉ dựa vào
  // việc xoá verifier sau khi fetch xong thì hai message tới sát nhau đều lọt qua cửa và cùng đổi
  // một mã, lần sau chắc chắn ăn invalid_grant.
  const maDaXuLyRef = useRef<Set<string>>(new Set());

  const guiHub = useCallback((msg: Record<string, unknown>) => {
    if (window.parent === window) return;
    window.parent.postMessage(msg, HUB_ORIGIN);
  }, []);

  useEffect(() => {
    // Mở thẳng địa chỉ này ngoài Hub: route /embed CHỈ dành cho khung nhúng, nên nói rõ và dừng —
    // kể cả khi trình duyệt còn phiên Factory. (Bản đầu vẫn dựng nội dung nếu có phiên, khiến báo
    // cáo "mở trực tiếp sẽ thấy màn hướng dẫn" sai với thực tế của người đang đăng nhập.)
    if (window.parent === window) { setTrangThai("ngoaiHub"); return; }

    let huy = false;
    let nhacTimer: ReturnType<typeof setInterval> | null = null;
    const dungNhac = () => { if (nhacTimer) { clearInterval(nhacTimer); nhacTimer = null; } };

    const nhan = async (event: MessageEvent) => {
      // CHỐT CHẶN: chỉ nghe Hub. Bỏ qua im lặng mọi nguồn khác, không phản hồi, không log ra console
      // (log ra là mách cho kẻ dò biết trang này đang chờ gì).
      if (event.origin !== HUB_ORIGIN) return;
      hubDaDapRef.current = true;   // Hub đã lên tiếng → thôi nhắc
      dungNhac();
      const data = event.data as { type?: string; code?: string };
      if (data?.type !== "embed:token" || !data.code || !verifierRef.current) return;
      if (maDaXuLyRef.current.has(data.code)) return;   // đã cầm mã này rồi — bỏ qua, đừng đổi lần hai
      maDaXuLyRef.current.add(data.code);
      try {
        const r = await fetch("/api/auth/embed", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ code: data.code, codeVerifier: verifierRef.current }),
        });
        const j = await r.json();
        verifierRef.current = "";                       // dùng một lần rồi bỏ
        // Hiện NGUYÊN VĂN lỗi của Hub ngay trong khung: đây là thứ duy nhất người bên Hub nhìn thấy
        // được khi soi iframe khác domain, và nó tiết kiệm cả một vòng thư qua lại.
        if (!r.ok) throw new Error(j.hubError ? `${j.error} · Hub báo: ${j.hubError} (verifier ${j.verifierLength} ký tự)` : j.error || "Không đổi được mã");
        if (!huy) { setTrangThai("sanSang"); router.replace("/"); }
      } catch (e) {
        if (!huy) { setLoi(e instanceof Error ? e.message : "Lỗi không rõ"); setTrangThai("loi"); }
        guiHub({ type: "embed:error", reason: "token_exchange_failed" });
      }
    };
    window.addEventListener("message", nhan);

    // Đã có phiên sẵn trong khung này (mở lại lần hai) thì khỏi xin mã mới
    fetch("/api/data?view=me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (!huy && d.user) { setTrangThai("sanSang"); dungNhac(); router.replace("/"); } })
      .catch(() => {});

    newPkce().then(({ verifier, challenge }) => {
      if (huy) return;
      verifierRef.current = verifier;
      let lan = 0;
      const nhac = () => {
        if (huy || hubDaDapRef.current || lan >= NHAC_TOI_DA) return dungNhac();
        lan++;
        guiHub({ type: "embed:ready", codeChallenge: challenge });
      };
      nhac();                                   // gửi ngay
      nhacTimer = setInterval(nhac, NHAC_MOI_MS); // rồi nhắc lại đến khi Hub đáp
    }).catch(() => {
      // crypto.subtle vắng mặt (khung sandbox quá chặt) — báo Hub thay vì chết im lặng
      if (!huy) { setLoi("Trình duyệt chặn hàm mã hoá trong khung nhúng"); setTrangThai("loi"); }
      guiHub({ type: "embed:error", reason: "pkce_unavailable" });
    });

    return () => { huy = true; dungNhac(); window.removeEventListener("message", nhan); };
  }, [guiHub, router]);

  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      {(trangThai === "dangCho" || trangThai === "sanSang") && <PageLoading />}
      {trangThai === "ngoaiHub" && (
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-ink">Trang này dành cho khung nhúng</p>
          <p className="mt-1 text-sm text-ink-2">Mở Học liệu Việt Anh từ trang chủ Hub, hoặc vào thẳng <Link href="/" className="text-brand underline decoration-dotted underline-offset-2">factory.vietanh.org</Link>.</p>
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
