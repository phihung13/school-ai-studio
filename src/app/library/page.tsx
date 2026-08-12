"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, PackageSearch, ExternalLink, Download, X, ArrowRight, Layers3, Folder, ChevronRight, Home, Atom, Eye, FolderOpen } from "lucide-react";
import Shell from "@/components/shell";
import { getData, Card, PageLoading, Empty, cls, M } from "@/components/ui";
import { User } from "@/lib/shared";
import { FMT_ORDER, FMT_ICON, FMT_LABEL, fileUrl } from "@/components/notebook-resources";

interface TnRes { kc: string; dok: number | null; format: string; name: string; ext: string; viewer: string; rel: string; folder: string; size: number; mtime: number }
interface TnFolder { id: string; kind: string; title: string; code?: string; resources: number; atomsWith: number; atomsTotal: number; formats: string[] }
interface Crumb { id: string; title: string; kind: string }
interface SearchHit { atomId: string; code?: string; title: string; chain: string; resources: TnRes[] }
interface TnData {
  level: string; breadcrumb: Crumb[]; folders: TnFolder[]; resources?: TnRes[]; results?: SearchHit[];
  atom?: { id: string; code?: string; title: string; chain: string };
  stats: { resources: number; atomsWith: number; atomsTotal: number }; unmatched: number;
}

const KB = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const KIND_LABEL: Record<string, string> = { subject: "Môn", grade: "Lớp", chapter: "Chương", lesson: "Bài", point: "Điểm kiến thức", atom: "Nguyên tử", disk: "Thư mục đĩa" };

export default function LibraryPage() {
  const [data, setData] = useState<TnData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [nodeId, setNodeId] = useState("");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    getData<TnData>("tainguyen", { node: nodeId, q, all: showAll ? "1" : "" }).then(setData).catch(() => {});
  }, [nodeId, q, showAll]);

  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const go = (id: string) => { setQ(""); setNodeId(id); };

  return (
    <Shell user={me}>
      <div className="fade-up pb-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Kho tài nguyên</h1>
            <p className="mt-1 text-sm text-ink-2">Học liệu NotebookLM — mở theo từng cấp: Môn › Lớp › Chương › Bài › Nguyên tử.</p>
          </div>
          <Link href="/library/xuong" className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand hover:text-brand">
            <Layers3 size={14} /> Học liệu cũ (xưởng AI) <ArrowRight size={13} />
          </Link>
        </div>

        {/* ── Thanh đường dẫn + tìm kiếm ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-sm">
            <button onClick={() => go("")} className={cls("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition hover:bg-surface-2", nodeId || q ? "text-muted hover:text-brand" : "text-ink")}>
              <Home size={14} /> Kho
            </button>
            {(data?.breadcrumb || []).map((b, i, arr) => (
              <React.Fragment key={b.id}>
                <ChevronRight size={13} className="shrink-0 text-line-strong" />
                <button onClick={() => go(b.id)} disabled={i === arr.length - 1}
                  className={cls("max-w-[280px] truncate rounded-md px-2 py-1 transition", i === arr.length - 1 ? "font-medium text-ink" : "text-muted hover:bg-surface-2 hover:text-brand")}>
                  {b.title}
                </button>
              </React.Fragment>
            ))}
            {q && <><ChevronRight size={13} className="shrink-0 text-line-strong" /><span className="px-2 py-1 font-medium text-ink">Kết quả tìm “{q}”</span></>}
          </nav>
          <div className="relative w-full max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong toàn kho…"
              className="w-full rounded-md border border-line-strong bg-surface py-2 pl-9 pr-8 text-sm text-ink outline-none transition focus:border-brand" />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted transition hover:text-ink"><X size={14} /></button>}
          </div>
        </div>

        {/* ── Số liệu cấp đang đứng ── */}
        {data && !q && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span><b className="text-ink">{data.stats.resources}</b> tài nguyên</span>
            {data.level !== "atom" && data.stats.atomsTotal > 0 && (
              <>
                <span className="h-3.5 w-px bg-line" />
                <span><b className="text-ink">{data.stats.atomsWith}</b>/{data.stats.atomsTotal} nguyên tử đã có</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((data.stats.atomsWith / data.stats.atomsTotal) * 100)}%` }} />
                </span>
              </>
            )}
            {data.level !== "atom" && !q && (
              <button onClick={() => setShowAll(!showAll)} className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-brand">
                {showAll ? "Chỉ hiện mục đã có tài nguyên" : "Hiện cả mục chưa có tài nguyên"}
              </button>
            )}
          </div>
        )}

        {!data ? <PageLoading /> : (
          <div className="mt-4">
            {/* ═══ KẾT QUẢ TÌM KIẾM ═══ */}
            {q ? (
              (data.results || []).length === 0
                ? <Empty icon={<PackageSearch size={28} strokeWidth={1.75} />} title="Không tìm thấy" hint="Thử từ khoá khác — tên nguyên tử, mã, tên chương hoặc tên định dạng." />
                : <div className="space-y-2">
                    {data.results!.map((h) => (
                      <Card key={h.atomId} className="p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => go(h.atomId)} className="min-w-0 flex-1 text-left">
                            <span className="block text-sm font-semibold text-ink transition hover:text-brand"><M>{h.title}</M></span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted"><M>{h.chain}</M></span>
                          </button>
                          {h.code && <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">{h.code}</span>}
                          <span className="rounded-full bg-brand-bg px-2 py-0.5 text-[11px] font-medium text-brand-ink">{h.resources.length} tài nguyên</span>
                        </div>
                      </Card>
                    ))}
                  </div>
            ) : data.level === "atom" || data.level === "unmatched" ? (
              /* ═══ CẤP LÁ — ma trận Định dạng × DOK ═══ */
              <ResourceMatrix atom={data.atom} resources={data.resources || []} />
            ) : (data.folders || []).length === 0 ? (
              <Empty icon={<PackageSearch size={28} strokeWidth={1.75} />} title="Mục này chưa có tài nguyên"
                hint={showAll ? "Sinh học liệu bằng NotebookLM — tệp lưu theo mã KC sẽ tự hiện ở đây." : "Bấm “Hiện cả mục chưa có tài nguyên” để xem toàn bộ danh mục."} />
            ) : (
              /* ═══ CẤP THƯ MỤC — danh sách mục con ═══ */
              <Card className="divide-y divide-line p-0">
                {data.folders.map((f) => {
                  const isAtom = f.kind === "atom";
                  const pct = f.atomsTotal > 0 ? Math.round((f.atomsWith / f.atomsTotal) * 100) : 0;
                  return (
                    <button key={f.id} onClick={() => go(f.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                      <span className={cls("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isAtom ? "bg-brand-bg text-brand" : f.resources ? "bg-brass-bg text-brass-ink" : "bg-surface-2 text-line-strong")}>
                        {isAtom ? <Atom size={17} strokeWidth={1.75} /> : <Folder size={17} strokeWidth={1.75} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink"><M>{f.title}</M></span>
                          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{KIND_LABEL[f.kind] || f.kind}</span>
                          {isAtom && f.code && <span className="shrink-0 font-mono text-[10px] text-line-strong">{f.code}</span>}
                        </span>
                        {/* dải định dạng đã có — nhìn lướt biết mục này giàu hay nghèo tài nguyên */}
                        {f.formats.length > 0 && (
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            {f.formats.map((k) => { const Icon = FMT_ICON[k] || PackageSearch; return <Icon key={k} size={12} className="text-muted" aria-label={FMT_LABEL[k] || k} />; })}
                            <span className="ml-1 text-[11px] text-muted">{f.formats.length}/9 định dạng</span>
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-ink">{f.resources || "—"}</span>
                        <span className="block text-[10px] text-muted">tài nguyên</span>
                      </span>
                      {!isAtom && f.atomsTotal > 0 && (
                        <span className="hidden w-28 shrink-0 sm:block">
                          <span className="block text-right text-[11px] text-muted">{f.atomsWith}/{f.atomsTotal} nguyên tử</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-line-strong" />
                    </button>
                  );
                })}
              </Card>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

/* Cấp lá: mỗi định dạng một hàng, mỗi DOK một cột → nhìn phát biết có gì, thiếu gì. */
function ResourceMatrix({ atom, resources }: { atom?: { id: string; code?: string; title: string; chain: string }; resources: TnRes[] }) {
  const doks = [...new Set(resources.map((r) => r.dok))].sort((a, b) => (a ?? 9) - (b ?? 9));
  const cols = doks.length ? doks : [null];
  const formats = [...FMT_ORDER, ...[...new Set(resources.map((r) => r.format))].filter((f) => !FMT_ORDER.includes(f as never))];
  const at = (f: string, d: number | null) => resources.find((r) => r.format === f && r.dok === d);

  return (
    <>
      {atom && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-ink"><M>{atom.title}</M></p>
            <p className="mt-0.5 text-[11px] text-muted"><M>{atom.chain}</M></p>
          </div>
          {atom.code && <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-muted">{atom.code}</span>}
          <Link href={`/atom/${atom.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-bg/40 hover:text-brand">
            <Eye size={14} /> Xem tại nguyên tử
          </Link>
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Định dạng</th>
              {cols.map((d) => <th key={String(d)} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{d ? `DOK ${d}` : "Bản chuẩn"}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {formats.map((f) => {
              const Icon = FMT_ICON[f] || PackageSearch;
              const any = cols.some((d) => at(f, d));
              return (
                <tr key={f} className={cls("transition", any ? "hover:bg-surface-2/50" : "opacity-45")}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <Icon size={15} className={any ? "text-brass-ink" : "text-line-strong"} />
                      <span className={cls("text-[13px]", any ? "font-medium text-ink" : "text-muted")}>{FMT_LABEL[f] || f}</span>
                    </span>
                  </td>
                  {cols.map((d) => {
                    const r = at(f, d);
                    return (
                      <td key={String(d)} className="px-3 py-2">
                        {r ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 transition hover:border-brand/60">
                            <a href={fileUrl(r.rel)} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-ink-2 transition hover:text-brand" title={`Mở ${FMT_LABEL[f] || f}`}>
                              {r.ext.toUpperCase()} <span className="text-[10px] text-muted">{KB(r.size)}</span>
                            </a>
                            <a href={fileUrl(r.rel)} target="_blank" rel="noopener noreferrer" title="Mở tab mới" className="text-muted transition hover:text-brand"><ExternalLink size={12} /></a>
                            <a href={fileUrl(r.rel)} download title="Tải về" className="text-muted transition hover:text-brand"><Download size={12} /></a>
                          </span>
                        ) : <span className="text-xs text-line-strong">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {resources.length === 0 && (
        <div className="mt-3"><Empty icon={<FolderOpen size={28} strokeWidth={1.75} />} title="Nguyên tử này chưa có tài nguyên" hint="Sinh học liệu bằng NotebookLM — tệp lưu theo mã KC sẽ tự hiện ở đây." /></div>
      )}
    </>
  );
}
