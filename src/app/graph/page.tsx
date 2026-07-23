"use client";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Shell from "@/components/shell";
import { getData, PageLoading, cls } from "@/components/ui";
import GraphView from "@/components/graph-view";
import ExplorerHeader from "@/components/explorer-header";
import type { TMNode } from "@/components/mindtree";
import { User, EdgeRelation, RELATION_HEX, RELATION_LABEL } from "@/lib/shared";
import { SlidersHorizontal, ArrowLeft, PanelLeftClose, ChevronRight } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GNode = any;
interface GraphData { nodes: GNode[]; edges: GNode[]; rootTitle: string; scope?: string }

function GraphInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [master, setMaster] = useState<GraphData | null>(null);
  const [tmNodes, setTmNodes] = useState<TMNode[]>([]);
  const focusParam = params.get("node") || null;
  // Điều hướng phân cấp — MỌI cấp đều bấm-để-vào: Toàn cảnh → Môn → Lớp → Chương → Cụm.
  const [navSub, setNavSub] = useState<{ id: string; title: string } | null>(null);
  const [navGrade, setNavGrade] = useState<number | null>(null);
  const [navCh, setNavCh] = useState<{ ch: number; title: string } | null>(null);
  const [navLes, setNavLes] = useState<{ id: string; title: string } | null>(null);
  const [verOnly, setVerOnly] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  useEffect(() => { getData<GraphData>("graph", focusParam ? { id: focusParam } : {}).then(setMaster).catch(() => {}); }, [focusParam]);
  useEffect(() => { getData<{ nodes: TMNode[] }>("treemap").then((d) => setTmNodes(d.nodes)).catch(() => {}); }, []);

  const isAll = !!master && master.scope === "all" && !focusParam;
  const level = !navSub ? 0 : navGrade == null ? 1 : !navCh ? 2 : !navLes ? 3 : 4;

  const subjects = useMemo(() => {
    if (!isAll || !master) return [] as { id: string; title: string; n: number }[];
    const m = new Map<string, { id: string; title: string; n: number }>();
    for (const n of master.nodes) { const k = n.subjectId || ""; const e = m.get(k) || { id: k, title: n.subject || "?", n: 0 }; e.n++; m.set(k, e); }
    return [...m.values()].sort((a, b) => (a.title > b.title ? 1 : -1));
  }, [master, isAll]);
  const gradesOf = useMemo(() => {
    if (!master || !navSub) return [] as { g: number; n: number }[];
    const m = new Map<number, number>();
    for (const n of master.nodes) if (n.subjectId === navSub.id && n.grade != null) m.set(n.grade, (m.get(n.grade) || 0) + 1);
    return [...m.entries()].map(([g, n]) => ({ g, n })).sort((a, b) => a.g - b.g);
  }, [master, navSub]);
  const chaptersOf = useMemo(() => {
    if (!master || !navSub || navGrade == null) return [] as { ch: number; title: string; n: number }[];
    const m = new Map<number, { ch: number; title: string; n: number }>();
    for (const n of master.nodes) if (n.subjectId === navSub.id && n.grade === navGrade) { const e = m.get(n.ch) || { ch: n.ch, title: n.chTitle || `Chương ${n.ch}`, n: 0 }; e.n++; m.set(n.ch, e); }
    return [...m.values()].sort((a, b) => a.ch - b.ch);
  }, [master, navSub, navGrade]);
  const lessonsOf = useMemo(() => {
    if (!master || !navSub || navGrade == null || !navCh) return [] as { id: string; title: string; n: number }[];
    const m = new Map<string, { id: string; title: string; n: number }>();
    for (const n of master.nodes) if (n.subjectId === navSub.id && n.grade === navGrade && n.ch === navCh.ch) { const k = n.lessonId || n.lessonTitle || "?"; const e = m.get(k) || { id: k, title: n.lessonTitle || "Điểm kiến thức", n: 0 }; e.n++; m.set(k, e); }
    return [...m.values()].sort((a, b) => (a.title > b.title ? 1 : -1));
  }, [master, navSub, navGrade, navCh]);

  // Phạm vi vẽ — đổi khi drill → GraphView layout lại đúng phạm vi (càng sâu càng nhỏ càng nhanh).
  const scope = useMemo(() => {
    if (!master) return null;
    if (!isAll || !navSub) return { nodes: master.nodes, edges: master.edges };
    const ok = (n: GNode) => n.subjectId === navSub.id && (navGrade == null || n.grade === navGrade) && (!navCh || n.ch === navCh.ch) && (!navLes || (n.lessonId || n.lessonTitle) === navLes.id);
    const nodes = master.nodes.filter(ok);
    const ids = new Set(nodes.map((n: GNode) => n.id));
    const edges = master.edges.filter((e: GNode) => ids.has(e.from) && ids.has(e.to));
    return { nodes, edges };
  }, [master, isAll, navSub, navGrade, navCh, navLes]);

  const shown = useMemo(() => {
    if (!scope) return { n: 0, e: 0 };
    if (!verOnly) return { n: scope.nodes.length, e: scope.edges.length };
    const vis = new Set<string>(); let n = 0;
    for (const x of scope.nodes) if (x.verified) { n++; vis.add(x.id); }
    let e = 0; for (const x of scope.edges) if (vis.has(x.from) && vis.has(x.to)) e++;
    return { n, e };
  }, [scope, verOnly]);

  const filterKey = useMemo(() => JSON.stringify([navSub?.id, navGrade, navCh?.ch, navLes?.id, verOnly]), [navSub, navGrade, navCh, navLes, verOnly]);

  if (!master || !scope) return <Shell user={me}><PageLoading /></Shell>;

  function back() { if (navLes) setNavLes(null); else if (navCh) setNavCh(null); else if (navGrade != null) setNavGrade(null); else if (navSub) setNavSub(null); }
  const crumb = level === 0 ? "Toàn cảnh" : [navSub?.title, navGrade != null ? `Lớp ${navGrade}` : null, navCh?.title, navLes?.title].filter(Boolean).join(" · ");

  const listHead = level === 0 ? "Chọn môn để mở đồ thị" : level === 1 ? "Chọn lớp" : level === 2 ? `Chương (${chaptersOf.length})` : level === 3 ? `Điểm kiến thức (${lessonsOf.length})` : "Nhỏ nhất — bấm hạt để xem chi tiết";
  type Item = { key: string; label: string; n?: number; dot?: string; go: () => void };
  const items: Item[] =
    level === 0 ? subjects.map((s) => ({ key: s.id, label: s.title, n: s.n, dot: subColor(s.id), go: () => { setNavSub({ id: s.id, title: s.title }); setNavGrade(null); setNavCh(null); setNavLes(null); } }))
    : level === 1 ? gradesOf.map((x) => ({ key: String(x.g), label: `Lớp ${x.g}`, n: x.n, go: () => { setNavGrade(x.g); setNavCh(null); setNavLes(null); } }))
    : level === 2 ? chaptersOf.map((c) => ({ key: String(c.ch), label: c.title, n: c.n, go: () => { setNavCh({ ch: c.ch, title: c.title }); setNavLes(null); } }))
    : level === 3 ? lessonsOf.map((l) => ({ key: l.id, label: l.title, n: l.n, go: () => setNavLes({ id: l.id, title: l.title }) }))
    : [];

  return (
    <Shell user={me}>
      <div className="fade-up flex h-[calc(100dvh-3.25rem)] flex-col overflow-hidden px-3 pt-2 lg:h-[calc(100dvh-1.5rem)] lg:px-6 lg:pt-3">
        <ExplorerHeader nodes={tmNodes} focusId={focusParam} lens="graph" />
        <div className="relative min-h-0 flex-1">
          <GraphView
            nodes={scope.nodes} edges={scope.edges} rootTitle={crumb}
            focusAtom={focusParam || undefined} showLegend={!isAll}
            filterVerOnly={isAll ? verOnly : false} colorMode={navSub ? "chapter" : "subject"} filterKey={filterKey}
            onOpenAtom={(id) => {
              // ghim nguyên tử đang xem vào entry lịch sử HIỆN TẠI → bấm Back từ trang nguyên tử
              // quay về đúng nguyên tử này (đã chọn sẵn), không văng ra /graph gốc
              try { window.history.replaceState(window.history.state, "", `/graph?node=${id}`); } catch { /* noop */ }
              router.push(`/atom/${id}`);
            }}
          />

          {isAll && collapsed && (
            <button onClick={() => setCollapsed(false)} title="Mở bộ lọc"
              className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface/95 text-brand shadow-sm backdrop-blur transition hover:border-brand">
              <SlidersHorizontal size={16} />
            </button>
          )}

          {isAll && !collapsed && (
            <div className="absolute left-3 top-3 z-10 flex w-[15rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface/95 shadow-sm backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
                {level > 0 ? (
                  <button onClick={back} title="Quay lại" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-black/5 hover:text-brand"><ArrowLeft size={15} /></button>
                ) : (
                  <span className="grid h-7 w-7 shrink-0 place-items-center text-brand"><SlidersHorizontal size={15} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[13px] font-semibold leading-tight text-ink" title={crumb}>{crumb}</p>
                  <p className="text-[10.5px] text-muted">{fmt(shown.n)} nguyên tử · {fmt(shown.e)} liên kết</p>
                </div>
                <button onClick={() => setCollapsed(true)} title="Thu gọn" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-black/5 hover:text-ink"><PanelLeftClose size={15} /></button>
              </div>

              <div className="max-h-[calc(100dvh-15rem)] overflow-y-auto px-2.5 py-2.5 scrollthin">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{listHead}</p>
                {items.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {items.map((it) => (
                      <button key={it.key} onClick={it.go}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-ink transition hover:bg-brand-bg/60">
                        {it.dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.dot }} />}
                        <span className="min-w-0 flex-1 truncate" title={it.label}>{it.label}</span>
                        {it.n != null && <span className="shrink-0 font-mono text-[10px] text-muted">{fmt(it.n)}</span>}
                        <ChevronRight size={13} className="shrink-0 text-line-strong transition group-hover:text-brand" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-2 text-[11px] leading-relaxed text-muted">Đây là cụm nhỏ nhất. Bấm một điểm trên đồ thị để xem tổng quan · chi tiết · ví dụ.</p>
                )}

                <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-line pt-2.5 text-xs text-ink-2">
                  <input type="checkbox" checked={verOnly} onChange={(e) => setVerOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-brand)]" />
                  Chỉ điểm đã thẩm định
                </label>
                <div className="mt-2.5 flex flex-col gap-0.5 border-t border-line pt-2.5 text-[11px] text-muted">
                  {(["prerequisite_hard", "related_soft", "misconception"] as EdgeRelation[]).map((r) => (
                    <span key={r} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: RELATION_HEX[r] }} />{RELATION_LABEL[r]}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function fmt(n: number) { return n.toLocaleString("vi-VN"); }
const SUBJ_HEX: Record<string, string> = { toan: "#c99a2e", nguvan: "#c65a44", tienganh: "#3a7fb0", khtn: "#2f9e63", gdcd: "#8a6fc0", congnghe: "#5570b8", vatli: "#c85a7a", hoahoc: "#2f9e8b", sinhhoc: "#7aa018", diali: "#cf8433", gdktpl: "#b05a92", oxford: "#2f9ea0" };
function subColor(id: string) { return SUBJ_HEX[id] || "#3f7a2e"; }

export default function GraphPage() {
  return <Suspense fallback={<Shell user={null}><PageLoading /></Shell>}><GraphInner /></Suspense>;
}
