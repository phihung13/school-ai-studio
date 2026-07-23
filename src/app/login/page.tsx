"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, User as UserIcon, Lock } from "lucide-react";
import { api, Button, Spinner, useToast } from "@/components/ui";

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
  const [toast, show] = useToast();

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
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-2xl text-on-brand">🌱</span>
            <h2 className="text-2xl font-bold text-ink">Đăng nhập</h2>
            <p className="mt-1 text-sm text-ink-2">Nhập tài khoản của bạn để vào Học liệu Việt Anh.</p>
          </div>

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
