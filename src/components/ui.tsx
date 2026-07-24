"use client";
import React from "react";
import {
  FileText, PencilLine, Presentation, ListChecks, Network, Layers, Mic, Clapperboard,
  Loader2, X, type LucideIcon,
} from "lucide-react";
import { PkgStatus, AssetStatus, AssetFormat, STATUS_LABEL, ASSET_STATUS_LABEL, PKG_STATUS_COLOR, ASSET_STATUS_COLOR, LEVEL_LABEL, LEVEL_COLOR, readableMath, SUP_OPEN, SUP_CLOSE, SUB_OPEN, SUB_CLOSE } from "@/lib/shared";
import { splitMath, katexHtml } from "@/lib/mathrender";

// Chữ có LaTeX → hiển thị công thức CHUẨN bằng KaTeX cho các đoạn delimited (\(…\), \[…\], $…$);
// phần chữ còn lại giữ hành vi cũ: ký hiệu trần → Unicode + <sup>/<sub> thật + **in đậm**.
//
// (Trước đây readableMath thay TOÀN BỘ LaTeX→Unicode gần đúng → mất gạch phân số / mũ lồng / vector-mũ.
//  Bản chuỗi thuần readableMath vẫn dùng cho PDF / DOCX / podcast / SVG — chỗ không nhận thẻ HTML.)
export function mathNodes(raw?: string | null): React.ReactNode[] {
  if (!raw) return [];
  return splitMath(String(raw)).map((s, i) =>
    s.math
      ? <span key={i} className={s.display ? "katex-block" : "katex-inline"} dangerouslySetInnerHTML={{ __html: katexHtml(s.value, s.display) }} />
      // readableMath .trim() cắt mất space ở ranh giới chữ↔công thức → dính ("Tínhc"). Giữ lại 1 space nếu đoạn gốc có.
      : <React.Fragment key={i}>{/^\s/.test(s.value) ? " " : null}{richNodes(readableMath(s.value, { marks: true }))}{/\s$/.test(s.value) ? " " : null}</React.Fragment>,
  );
}
// Nhận chuỗi ĐÃ đánh dấu (dùng khi nơi gọi cần tự cắt tiền tố dòng: gạch đầu dòng, số thứ tự…).
export function richNodes(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // tách theo dấu mũ/chỉ số, đồng thời hiểu **in đậm** trong phần chữ
  const re = new RegExp(`([${SUP_OPEN}${SUB_OPEN}])(.*?)[${SUP_CLOSE}${SUB_CLOSE}]`, "gs");
  let last = 0, m: RegExpExecArray | null;
  const plain = (txt: string) => {
    const bold = /\*\*(.+?)\*\*/g;
    let i = 0, b: RegExpExecArray | null;
    while ((b = bold.exec(txt))) {
      if (b.index > i) out.push(txt.slice(i, b.index));
      out.push(<strong key={out.length}>{b[1]}</strong>);
      i = b.index + b[0].length;
    }
    if (i < txt.length) out.push(txt.slice(i));
  };
  while ((m = re.exec(s))) {
    if (m.index > last) plain(s.slice(last, m.index));
    const Tag = m[1] === SUP_OPEN ? "sup" : "sub";
    out.push(<Tag key={out.length} className="text-[0.72em] leading-none">{m[2]}</Tag>);
    last = m.index + m[0].length;
  }
  if (last < s.length) plain(s.slice(last));
  return out;
}
export function M({ children }: { children?: string | null }) { return <>{mathNodes(children)}</>; }

// ===== data helpers =====
export async function api<T = Record<string, unknown>>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/action", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Có lỗi xảy ra");
  return json as T;
}

export async function getData<T = Record<string, unknown>>(view: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ view, ...params }).toString();
  const res = await fetch(`/api/data?${qs}`);
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Chưa đăng nhập"); }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Không tải được dữ liệu");
  return json as T;
}

export function cls(...xs: (string | false | undefined | null)[]) { return xs.filter(Boolean).join(" "); }

// ===== icons =====
const FORMAT_ICONS: Record<AssetFormat, LucideIcon> = {
  text: FileText, worksheet: PencilLine, slide: Presentation, quiz: ListChecks,
  mindmap: Network, flashcard: Layers, podcast: Mic, video: Clapperboard,
};
export function FormatIcon({ format, className, size = 18 }: { format: AssetFormat; className?: string; size?: number }) {
  const I = FORMAT_ICONS[format];
  return <I size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

// ===== spinner / loading =====
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cls("inline-flex items-center gap-2 text-sm text-muted", className)}>
      <Loader2 size={16} className="animate-spin text-brand" aria-hidden />
      {label}
    </span>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />)}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

// ===== card =====
export function Card({ children, className, onClick, interactive }: { children: React.ReactNode; className?: string; onClick?: () => void; interactive?: boolean }) {
  const hover = onClick || interactive;
  return (
    <div onClick={onClick}
      className={cls("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(20,60,30,0.04)]",
        hover && "cursor-pointer transition-shadow duration-200 hover:border-brand-line hover:shadow-[0_6px_20px_rgba(20,80,40,0.10)]", className)}>
      {children}
    </div>
  );
}

// ===== button =====
type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({ children, onClick, variant = "primary", disabled, className, type }: {
  children: React.ReactNode; onClick?: () => void; variant?: Variant; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  const styles: Record<Variant, string> = {
    primary: "bg-brand text-on-brand hover:bg-brand-ink active:translate-y-px disabled:opacity-45",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2 active:translate-y-px disabled:opacity-45",
    danger: "border border-danger-line bg-danger-bg text-danger hover:bg-danger hover:text-on-brand active:translate-y-px disabled:opacity-45",
    ghost: "text-brand hover:bg-brand-bg active:translate-y-px disabled:opacity-40",
  };
  return (
    <button type={type || "button"} onClick={onClick} disabled={disabled}
      className={cls("inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed", styles[variant], className)}>
      {children}
    </button>
  );
}

// ===== badges =====
export function StatusBadge({ status }: { status: PkgStatus }) {
  return <span className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", PKG_STATUS_COLOR[status])}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{STATUS_LABEL[status]}
  </span>;
}
export function AssetBadge({ status }: { status: AssetStatus }) {
  return <span className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", ASSET_STATUS_COLOR[status])}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{ASSET_STATUS_LABEL[status]}
  </span>;
}
export function LevelChip({ level, active, onClick }: { level: number; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cls("rounded-full px-3 py-1 text-xs font-semibold transition", LEVEL_COLOR[level], onClick && "hover:brightness-95", active && "ring-2 ring-brand ring-offset-1 ring-offset-surface", !onClick && "cursor-default")}>
      Mức {level} · {LEVEL_LABEL[level]}
    </button>
  );
}

// ===== progress =====
export function Progress({ value, className, tone = "ok" }: { value: number; className?: string; tone?: "ok" | "brand" | "warn" }) {
  const bar = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div className={cls("h-1.5 w-full overflow-hidden rounded-full bg-sink", className)}>
      <div className={cls("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ===== modal ===== (native dialog-like, in-flow backdrop)
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/35 p-4 fade-in" style={{ zIndex: 50 }} onClick={onClose}>
      <div className={cls("max-h-[85vh] w-full overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-xl scrollthin fade-up", wide ? "max-w-3xl" : "max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Đóng"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ===== load error =====
export function LoadError({ msg, backHref = "/", backLabel = "Về trang chủ", onRetry }: { msg: string; backHref?: string; backLabel?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface px-6 py-16 text-center fade-up">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg text-danger"><X size={26} /></span>
      <p className="mt-3 text-lg font-semibold text-ink">Không mở được nội dung này</p>
      <p className="mt-1 max-w-md text-sm text-ink-2">{msg}</p>
      <div className="mt-4 flex gap-2">
        {onRetry && <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-2">Thử lại</button>}
        <a href={backHref} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-on-brand transition hover:bg-brand-ink">{backLabel}</a>
      </div>
    </div>
  );
}

// ===== empty =====
export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2/50 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-display text-lg font-medium text-ink">{title}</p>
      {hint && <p className="mt-1.5 max-w-md text-sm text-ink-2">{hint}</p>}
    </div>
  );
}

// ===== toast =====
function Toast({ msg, kind }: { msg: string; kind: "ok" | "err" }) {
  return (
    <div className={cls("fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-on-brand shadow-lg fade-up", kind === "ok" ? "bg-ink" : "bg-danger")} style={{ zIndex: 60 }}>
      {msg}
    </div>
  );
}
export function useToast(): [React.ReactNode, (msg: string, kind?: "ok" | "err") => void] {
  const [t, setT] = React.useState<{ msg: string; kind: "ok" | "err"; id: number } | null>(null);
  const show = React.useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = performance.now();
    setT({ msg, kind, id });
    setTimeout(() => setT((cur) => (cur && cur.id === id ? null : cur)), 3200);
  }, []);
  return [t ? <Toast key={t.id} msg={t.msg} kind={t.kind} /> : null, show];
}

// ===== time =====
export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
