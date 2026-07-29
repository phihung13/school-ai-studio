"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, User as UserIcon, Lock } from "lucide-react";
import { api, Button, Spinner, useToast } from "@/components/ui";
import { LogoBadge } from "@/components/logo";

// Lỗi do route /api/auth/oidc/callback ném về dưới dạng ?err= — dịch sang tiếng người dùng
const SSO_ERR: Record<string, string> = {
  "sai-domain": "Email này không thuộc trường nên chưa được vào. Hãy dùng email do trường cấp, hoặc đăng nhập bằng mật khẩu.",
  "trung-lien-ket": "Email này đã gắn với một tài khoản khác trong hệ thống. Báo quản trị kiểm tra giúp bạn.",
  "khong-ket-noi": "Chưa hỏi được nhà cung cấp đăng nhập. Thử lại sau ít phút, hoặc đăng nhập bằng mật khẩu.",
  "thieu-email": "Tài khoản này không chia sẻ email nên không xác định được bạn là ai.",
  "chua-cau-hinh": "Quản trị chưa bật đăng nhập một lần cho hệ thống.",
  "phien-het-han": "Lượt đăng nhập đã hết hạn. Bấm lại nút ở trên giúp mình nhé.",
  "google-tu-choi": "Nhà cung cấp không xác nhận được tài khoản. Thử lại lần nữa xem sao.",
  "email-chua-xac-thuc": "Email của tài khoản này chưa được nhà cung cấp xác thực.",
  huy: "Bạn đã huỷ lượt đăng nhập.",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.4z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.2-2.9.7-4.3v-5.7H4.5C2.9 17.1 2 20.4 2 24s.9 6.9 2.5 10l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}

const LEAVES = [
  [120, 96, 30, "#4F9A3C"], [92, 118, 26, "#5FAE46"], [148, 118, 26, "#3E8C6A"], [120, 130, 28, "#4F9A3C"],
  [78, 146, 22, "#6FA83A"], [162, 146, 22, "#57A05A"], [104, 150, 22, "#5FAE46"], [136, 150, 22, "#3E8C6A"],
  [120, 162, 24, "#4F9A3C"], [96, 176, 18, "#6FA83A"], [144, 176, 18, "#57A05A"],
] as const;

function TreeScene() {
  return (
    <svg viewBox="0 0 240 300" className="h-full max-h-[42vh] w-auto" aria-hidden>
      <ellipse cx="120" cy="286" rx="66" ry="9" fill="#0b3a1e" opacity="0.14" />
      <g className="lf-trunk">
        <path d="M112 286 L112 176 Q108 150 120 150 Q132 150 128 176 L128 286 Z" fill="#6E4B2C" />
        <path d="M118 200 Q96 188 84 168" stroke="#6E4B2C" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M122 196 Q146 186 158 166" stroke="#6E4B2C" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M112 286 Q96 292 82 300" stroke="#5A3D22" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M128 286 Q144 292 158 300" stroke="#5A3D22" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <g className="lf-crown">
        {LEAVES.map(([cx, cy, r, col], i) => (
          <circle key={i} className="lf-leaf" cx={cx} cy={cy} r={r} fill={col as string} style={{ animationDelay: `${0.6 + i * 0.06}s` }} />
        ))}
      </g>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState<{ id: string; label: string }[]>([]);
  const [toast, show] = useToast();

  useEffect(() => {
    // hỏi server có bật SSO không (view "me" không cần đăng nhập) + báo lỗi lượt Google vừa hỏng
    const err = new URLSearchParams(window.location.search).get("err");
    fetch("/api/data?view=me").then((r) => r.json()).then((d) => {
      const list: { id: string; label: string }[] = Array.isArray(d.sso) ? d.sso : [];
      setSso(list);
      // Gia hạn im lặng: phiên qua Hub chỉ sống 15 phút theo quy định, nhưng nếu bên Hub vẫn còn
      // phiên thì người dùng không việc gì phải bấm lại — chuyển hướng prompt=none, hỏng thì Hub
      // trả login_required và ta quay về đúng trang này.
      const last = document.cookie.match(/(?:^|;\s*)vaks_idp=([^;]+)/)?.[1];
      if (!err && !d.user && last && list.some((x) => x.id === last) && !sessionStorage.getItem("va_silent")) {
        sessionStorage.setItem("va_silent", "1");
        window.location.href = `/api/auth/oidc?p=${encodeURIComponent(last)}&silent=1`;
      }
    }).catch(() => {});
    if (err) {
      show(SSO_ERR[err] || "Không đăng nhập được bằng tài khoản trường.", "err");
      window.history.replaceState(null, "", "/login"); // dọn URL để F5 không hiện lại lỗi cũ
    }
  }, [show]);

  const login = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      await api("login", { username: username.trim(), password });
      router.push("/");
    } catch (e) {
      show(e instanceof Error ? e.message : "Lỗi đăng nhập", "err");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh min-h-[540px] overflow-hidden">
      {/* Panel thương hiệu — tự co, không tràn */}
      <div className="relative hidden w-[46%] flex-col overflow-hidden bg-brand p-8 text-on-brand lg:flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="lf-float pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-on-brand/40"
            style={{ left: `${15 + i * 17}%`, top: `${8 + (i % 3) * 6}%`, ["--fx" as string]: `${i % 2 ? 60 : -50}px`, ["--fd" as string]: `${6 + i}s`, animationDelay: `${1 + i * 0.7}s` }} />
        ))}
        <p className="shrink-0 text-lg font-bold">Học liệu Việt Anh</p>
        <div className="flex min-h-0 flex-1 items-center justify-center py-4"><TreeScene /></div>
        <div className="shrink-0">
          <h1 className="text-[clamp(1.5rem,2.4vw,2rem)] font-bold leading-tight text-balance">Gieo một hạt kiến thức, gặt cả một cây học liệu.</h1>
          <p className="mt-2 max-w-sm text-[clamp(0.8rem,1vw,0.9rem)] leading-relaxed text-on-brand/80">Dựng cây kiến thức của trường; AI giúp biên soạn và chuyển thể thành slide, quiz, video, podcast — giáo viên vẫn làm chủ tri thức.</p>
        </div>
      </div>

      {/* Form — căn giữa, tự cuộn nếu màn quá thấp */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        {toast}
        <div className="w-full max-w-sm fade-up">
          <div className="mb-6">
            <LogoBadge size="lg" className="mb-3 shadow-sm" />
            <h2 className="text-2xl font-bold text-ink">Đăng nhập</h2>
            <p className="mt-1 text-sm text-ink-2">Nhập tài khoản của bạn để vào Học liệu Việt Anh.</p>
          </div>

          {sso.length > 0 && (
            <>
              <div className="space-y-2.5">
                {sso.map((p) => (
                  <a key={p.id} href={`/api/auth/oidc?p=${encodeURIComponent(p.id)}`}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-surface py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2 active:translate-y-px">
                    {p.id === "google" ? <GoogleMark /> : <LogoBadge size="sm" />}Tiếp tục với {p.label}
                  </a>
                ))}
              </div>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-muted">hoặc dùng mật khẩu</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <label className="mb-1.5 block text-sm font-medium text-ink">Tên đăng nhập hoặc email</label>
          <div className="relative">
            <UserIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus aria-label="Tên đăng nhập hoặc email"
              onKeyDown={(e) => e.key === "Enter" && (document.getElementById("pw") as HTMLInputElement)?.focus()}
              placeholder="vd: gv.lan"
              className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand" />
          </div>

          <label className="mb-1.5 mt-4 block text-sm font-medium text-ink">Mật khẩu</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Mật khẩu"
              onKeyDown={(e) => e.key === "Enter" && !busy && login()}
              placeholder="••••••••"
              className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand" />
          </div>

          <Button onClick={login} disabled={busy || !username.trim() || !password} className="mt-5 w-full py-2.5">
            {busy ? <Spinner /> : <>Đăng nhập <ArrowRight size={16} /></>}
          </Button>

          <p className="mt-4 text-center text-xs text-muted">
            Bản demo: tên đăng nhập <b className="text-ink-2">gv.lan</b>, <b className="text-ink-2">tt.minh</b>, <b className="text-ink-2">qt.hung</b>, <b className="text-ink-2">bgh.duong</b> · mật khẩu <b className="text-ink-2">vietanh2026</b>
          </p>
        </div>
      </div>
    </div>
  );
}
