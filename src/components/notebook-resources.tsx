"use client";
import React, { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Network, Film, MessagesSquare, Mic, Presentation, ListChecks, Layers, Download, ExternalLink, type LucideIcon } from "lucide-react";
import { Card, cls } from "@/components/ui";

// Định dạng NotebookLM (khớp lib/tainguyen.ts)
type TnViewer = "iframe" | "pdf" | "video" | "audio" | "image" | "markdown" | "download";
interface TnResource { kc: string; dok: number | null; format: string; name: string; ext: string; viewer: TnViewer; rel: string; size: number; mtime: number }

export const FMT_ORDER = ["Text", "Infographic", "Mindmap", "Video", "Audio-tranh-luan", "Podcast", "Slide", "Quiz", "Flashcards"] as const;
export const FMT_ICON: Record<string, LucideIcon> = {
  Text: FileText, Infographic: ImageIcon, Mindmap: Network, Video: Film,
  "Audio-tranh-luan": MessagesSquare, Podcast: Mic, Slide: Presentation, Quiz: ListChecks, Flashcards: Layers,
};
export const FMT_LABEL: Record<string, string> = {
  Text: "Bài đọc", Infographic: "Infographic", Mindmap: "Sơ đồ tư duy", Video: "Video",
  "Audio-tranh-luan": "Audio tranh luận", Podcast: "Podcast", Slide: "Slide", Quiz: "Quiz", Flashcards: "Flashcards",
};
export const fileUrl = (rel: string) => `/api/tainguyen?file=${encodeURIComponent(rel)}`;

export default function NotebookResources({ kc }: { kc: string }) {
  const [list, setList] = useState<TnResource[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dok, setDok] = useState<number | "all">("all");
  const [active, setActive] = useState<TnResource | null>(null);
  const [md, setMd] = useState<string>("");

  useEffect(() => {
    fetch(`/api/tainguyen?kc=${encodeURIComponent(kc)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setList(d.resources || []); })
      .catch((e) => setErr(e.message));
  }, [kc]);

  const doks = useMemo(() => {
    const s = new Set<number>();
    (list || []).forEach((r) => r.dok && s.add(r.dok));
    return [...s].sort();
  }, [list]);

  const shown = useMemo(() => (list || []).filter((r) => dok === "all" || r.dok === dok), [list, dok]);

  // gom theo định dạng (giữ thứ tự chuẩn), mỗi định dạng lấy tài nguyên đại diện + các bản DOK khác
  const byFormat = useMemo(() => {
    const m: Record<string, TnResource[]> = {};
    shown.forEach((r) => { (m[r.format] ||= []).push(r); });
    const order = FMT_ORDER as readonly string[];
    const ordered = FMT_ORDER.filter((f) => m[f]).map((f) => ({ format: f as string, items: m[f] }));
    const extra = Object.keys(m).filter((f) => !order.includes(f)).map((f) => ({ format: f, items: m[f] }));
    return [...ordered, ...extra];
  }, [shown]);

  // trạng thái đã-xong: định dạng nào đã có (bất kỳ DOK)
  const doneSet = useMemo(() => new Set((list || []).map((r) => r.format)), [list]);

  // tự chọn tài nguyên đầu tiên để "demo" hiện ngay
  useEffect(() => { if (!active && byFormat.length) setActive(byFormat[0].items[0]); }, [byFormat, active]);
  useEffect(() => {
    if (active?.viewer === "markdown") {
      setMd("… đang tải …");
      fetch(fileUrl(active.rel)).then((r) => r.text()).then(setMd).catch(() => setMd("Không đọc được tệp."));
    }
  }, [active]);

  if (err) return <p className="text-sm text-muted">Chưa nạp được tài nguyên: {err}</p>;
  if (!list) return <p className="text-sm text-muted">Đang tải tài nguyên…</p>;

  if (list.length === 0) {
    return (
      <Card className="border-dashed p-6 text-center">
        <p className="text-sm text-muted">Nguyên tử này <b className="text-ink-2">chưa có tài nguyên</b> nào (NotebookLM).</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {FMT_ORDER.map((f) => {
            const Icon = FMT_ICON[f];
            return <span key={f} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[11px] text-muted"><Icon size={12} /> {FMT_LABEL[f]}</span>;
          })}
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Trạng thái đã-xong: 9 định dạng, tô đậm nếu có */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Đã có:</span>
        {FMT_ORDER.map((f) => {
          const Icon = FMT_ICON[f]; const done = doneSet.has(f);
          return (
            <span key={f} title={done ? "Đã có" : "Chưa làm"}
              className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                done ? "bg-ok-bg text-ok" : "border border-dashed border-line-strong text-line-strong")}>
              <Icon size={12} /> {FMT_LABEL[f]} {done ? "✓" : ""}
            </span>
          );
        })}
      </div>

      {/* Chọn DOK */}
      {doks.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button onClick={() => setDok("all")} className={cls("rounded-full px-3 py-1 text-xs font-semibold transition", dok === "all" ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-ink-2")}>Mọi độ khó</button>
          {doks.map((d) => (
            <button key={d} onClick={() => setDok(d)} className={cls("rounded-full px-3 py-1 text-xs font-semibold transition", dok === d ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-ink-2")}>DOK {d}</button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* Cột trái: danh sách định dạng để chọn */}
        <div className="space-y-1.5">
          {byFormat.map(({ format, items }) => {
            const Icon = FMT_ICON[format] || FileText;
            return (
              <div key={format} className="rounded-xl border border-line bg-surface p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon size={16} className="shrink-0 text-brass-ink" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{FMT_LABEL[format] || format}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.sort((a, b) => (a.dok ?? 0) - (b.dok ?? 0)).map((r) => (
                    <button key={r.rel} onClick={() => setActive(r)}
                      className={cls("rounded-md border px-2 py-1 text-[11px] font-medium transition",
                        active?.rel === r.rel ? "border-brand bg-brand-bg text-brand-ink" : "border-line text-ink-2 hover:border-brand/60 hover:text-brand")}>
                      {r.dok ? `DOK ${r.dok}` : (r.name || "Mở")}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cột phải: khung demo — nhúng tài nguyên đang chọn */}
        <div className="min-w-0">
          {active ? (
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b border-line bg-surface-2/50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {FMT_LABEL[active.format] || active.format}{active.dok ? ` · DOK ${active.dok}` : ""}{active.name ? ` — ${active.name}` : ""}
                </span>
                <a href={fileUrl(active.rel)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition hover:border-brand hover:text-brand" title="Mở tab mới"><ExternalLink size={12} /> Tab mới</a>
                <a href={fileUrl(active.rel)} download className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition hover:border-brand hover:text-brand" title="Tải về"><Download size={12} /></a>
              </div>
              <Viewer r={active} md={md} />
            </Card>
          ) : <p className="text-sm text-muted">Chọn một tài nguyên để xem.</p>}
        </div>
      </div>
    </div>
  );
}

function Viewer({ r, md }: { r: TnResource; md: string }) {
  const src = fileUrl(r.rel);
  const frame = "h-[70vh] max-h-[640px] w-full";
  switch (r.viewer) {
    case "video": return <video key={src} src={src} controls className="max-h-[640px] w-full bg-black" />;
    case "audio": return <div className="p-5"><audio key={src} src={src} controls className="w-full" /></div>;
    case "image": return <div className="max-h-[70vh] overflow-auto bg-surface-2/40 p-3 text-center"><img src={src} alt={r.name} className="mx-auto max-w-full rounded" /></div>;
    case "pdf":
    case "iframe": return <iframe key={src} src={src} className={frame} title={r.name} />;
    case "markdown": return <div className="max-h-[70vh] overflow-auto px-5 py-4"><pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-2">{md}</pre></div>;
    default: return <div className="p-6 text-center text-sm text-muted">Định dạng .{r.ext} — <a href={src} download className="text-brand underline">tải về</a> để xem.</div>;
  }
}
