"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, PackageSearch, ExternalLink, Download, FolderTree, X, ArrowRight, Layers3 } from "lucide-react";
import Shell from "@/components/shell";
import { getData, Card, PageLoading, Empty, cls, M } from "@/components/ui";
import { User } from "@/lib/shared";
import { FMT_ORDER, FMT_ICON, FMT_LABEL, fileUrl } from "@/components/notebook-resources";

interface TnRes { kc: string; dok: number | null; format: string; name: string; ext: string; viewer: string; rel: string; folder: string; size: number; mtime: number }
interface Group { key: string; atomId?: string; code?: string; title: string; chain: string; subject?: string; grade?: number | null; resources: TnRes[] }
interface Facet { id: string; title: string; count: number }
interface TnData {
  groups: Group[];
  facets: { subjects: Facet[]; grades: Facet[]; chapters: Facet[]; lessons: Facet[]; formats: { format: string; count: number }[]; doks: { dok: number; count: number }[] };
  total: number; totalAll: number; coverage: { covered: number; scopeAtoms: number }; unmatched: number;
}

const KB = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function LibraryPage() {
  const [data, setData] = useState<TnData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [fmt, setFmt] = useState("");
  const [dok, setDok] = useState("");
  const [sel, setSel] = useState({ subject: "", grade: "", chapter: "", lesson: "" });

  const load = useCallback(() => {
    getData<TnData>("tainguyen", { q, format: fmt, dok, ...sel }).then(setData).catch(() => {});
  }, [q, fmt, dok, sel]);

  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const hasFilter = !!(q || fmt || dok || sel.subject || sel.grade || sel.chapter || sel.lesson);
  const clearAll = () => { setQ(""); setFmt(""); setDok(""); setSel({ subject: "", grade: "", chapter: "", lesson: "" }); };

  // chọn cấp trên thì bỏ chọn các cấp dưới (tránh lọc mâu thuẫn)
  const setLevel = (k: "subject" | "grade" | "chapter" | "lesson", v: string) =>
    setSel((s) => k === "subject" ? { subject: v, grade: "", chapter: "", lesson: "" }
      : k === "grade" ? { ...s, grade: v, chapter: "", lesson: "" }
      : k === "chapter" ? { ...s, chapter: v, lesson: "" } : { ...s, lesson: v });

  const pct = data && data.coverage.scopeAtoms > 0 ? Math.round((data.coverage.covered / data.coverage.scopeAtoms) * 100) : 0;

  // chèn tiêu đề phân nhóm khi đổi Môn · Lớp (danh sách đã sắp theo đúng thứ tự cây)
  const rendered = useMemo(() => {
    const out: { header?: string; g?: Group }[] = [];
    let last = "";
    for (const g of data?.groups || []) {
      const head = [g.subject || "Chưa khớp cây", g.grade ? `Lớp ${g.grade}` : ""].filter(Boolean).join(" · ");
      if (head !== last) { out.push({ header: head }); last = head; }
      out.push({ g });
    }
    return out;
  }, [data]);

  return (
    <Shell user={me}>
      <div className="fade-up pb-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Kho tài nguyên</h1>
            <p className="mt-1 text-sm text-ink-2">Học liệu NotebookLM gắn theo từng nguyên tử — lọc theo môn, lớp, chương, bài.</p>
          </div>
          <Link href="/library/xuong" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand hover:text-brand">
            <Layers3 size={14} /> Học liệu cũ (xưởng AI) <ArrowRight size={13} />
          </Link>
        </div>

        {/* ── Số liệu phạm vi đang xem ── */}
        {data && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/40 px-4 py-3">
            <span className="text-sm text-ink-2"><b className="font-display text-lg text-ink">{data.total}</b> tài nguyên{data.total !== data.totalAll && <span className="text-muted"> / {data.totalAll}</span>}</span>
            <span className="h-4 w-px bg-line" />
            <span className="flex min-w-[220px] flex-1 items-center gap-2.5">
              <span className="text-sm text-ink-2"><b className="text-ink">{data.coverage.covered}</b>/{data.coverage.scopeAtoms} nguyên tử đã có</span>
              <span className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-xs font-semibold text-brand">{pct}%</span>
            </span>
            {data.unmatched > 0 && <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-[11px] text-warn">{data.unmatched} tệp chưa khớp nguyên tử</span>}
          </div>
        )}

        {/* ── Bộ lọc ── */}
        <div className="mt-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên nguyên tử, mã, chương…"
                className="w-full rounded-md border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand" />
            </div>
            {hasFilter && (
              <button onClick={clearAll} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink">
                <X size={14} /> Xoá lọc
              </button>
            )}
          </div>

          {/* Môn › Lớp › Chương › Bài */}
          <div className="flex flex-wrap items-center gap-2">
            <FolderTree size={15} className="text-muted" aria-hidden />
            {([["subject", "Mọi môn", data?.facets.subjects], ["grade", "Mọi lớp", data?.facets.grades], ["chapter", "Mọi chương", data?.facets.chapters], ["lesson", "Mọi bài", data?.facets.lessons]] as const).map(([k, label, opts]) => (
              <select key={k} value={sel[k]} onChange={(e) => setLevel(k, e.target.value)} disabled={!opts?.length}
                className={cls("max-w-[210px] truncate rounded-md border bg-surface px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-brand disabled:opacity-50",
                  sel[k] ? "border-brand text-brand-ink" : "border-line-strong")}>
                <option value="">{label}{opts?.length ? ` (${opts.length})` : ""}</option>
                {(opts || []).map((o) => <option key={o.id} value={o.id}>{o.title} · {o.count}</option>)}
              </select>
            ))}
          </div>

          {/* Định dạng + DOK */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(data?.facets.formats || []).map(({ format, count }) => {
              const Icon = FMT_ICON[format] || PackageSearch; const on = fmt === format;
              return (
                <button key={format} onClick={() => setFmt(on ? "" : format)}
                  className={cls("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    on ? "border-brand bg-brand-bg text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                  <Icon size={14} /> {FMT_LABEL[format] || format} <span className="text-[10px] text-muted">{count}</span>
                </button>
              );
            })}
            {(data?.facets.doks || []).length > 0 && <span className="mx-1 h-4 w-px bg-line" />}
            {(data?.facets.doks || []).map(({ dok: d, count }) => (
              <button key={d} onClick={() => setDok(dok === String(d) ? "" : String(d))}
                className={cls("rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  dok === String(d) ? "border-brass bg-brass-bg text-brass-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                DOK {d} <span className="text-[10px] text-muted">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Danh sách theo nguyên tử ── */}
        {!data ? <PageLoading /> : data.groups.length === 0 ? (
          <div className="mt-6">
            <Empty icon={<PackageSearch size={28} strokeWidth={1.75} />}
              title={hasFilter ? "Không có tài nguyên khớp bộ lọc" : "Kho tài nguyên còn trống"}
              hint={hasFilter ? "Thử bỏ bớt điều kiện lọc." : "Sinh học liệu bằng NotebookLM — tệp lưu trong D:\\TaiNguyen theo mã KC sẽ tự hiện ở đây."} />
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {rendered.map((row, i) => row.header ? (
              <h2 key={`h-${i}`} className={cls("font-display text-sm font-semibold uppercase tracking-wide text-muted", i > 0 && "pt-3")}>{row.header}</h2>
            ) : (
              <Card key={row.g!.key} className="p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink"><M>{row.g!.title}</M></p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted"><M>{row.g!.chain}</M></p>
                  </div>
                  {row.g!.code && <span className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{row.g!.code}</span>}
                  {row.g!.atomId && (
                    <Link href={`/atom/${row.g!.atomId}`} className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-bg/40 hover:text-brand">
                      Mở nguyên tử <ArrowRight size={12} />
                    </Link>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.g!.resources.map((r) => {
                    const Icon = FMT_ICON[r.format] || PackageSearch;
                    return (
                      <span key={r.rel} className="group inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 transition hover:border-brand/60">
                        <Icon size={14} className="shrink-0 text-brass-ink" />
                        <a href={fileUrl(r.rel)} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-ink-2 transition group-hover:text-brand">
                          {FMT_LABEL[r.format] || r.format}{r.dok ? <span className="ml-1 text-[10px] text-muted">DOK {r.dok}</span> : null}
                        </a>
                        <span className="text-[10px] text-line-strong">{KB(r.size)}</span>
                        <a href={fileUrl(r.rel)} target="_blank" rel="noopener noreferrer" title="Mở tab mới" className="text-muted transition hover:text-brand"><ExternalLink size={12} /></a>
                        <a href={fileUrl(r.rel)} download title="Tải về" className="text-muted transition hover:text-brand"><Download size={12} /></a>
                      </span>
                    );
                  })}
                </div>

                {/* dấu định dạng còn thiếu — nhìn ra ngay nguyên tử nào chưa đủ bộ */}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="mr-0.5 text-[10px] uppercase tracking-wide text-line-strong">Chưa có:</span>
                  {FMT_ORDER.filter((f) => !row.g!.resources.some((r) => r.format === f)).map((f) => (
                    <span key={f} className="rounded px-1.5 py-0.5 text-[10px] text-line-strong">{FMT_LABEL[f]}</span>
                  ))}
                  {FMT_ORDER.every((f) => row.g!.resources.some((r) => r.format === f)) && <span className="text-[10px] font-semibold text-ok">Đủ 9 định dạng ✓</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
