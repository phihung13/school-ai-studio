"use client";
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Cog, Play, Pause, Square, Trash2, Plus, X, ChevronRight, FileText, Sparkles, Wand2, AlertTriangle, Info, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, Button, Progress, useToast, timeAgo, cls, FormatIcon, M } from "@/components/ui";
import { TreeNode, Job, JobItem, User, AssetFormat, FORMAT_LABEL, JOB_STATUS_LABEL, LEVEL_LABEL } from "@/lib/shared";

interface SubjectStats { atomCount: number; totalPkgs: number; drafted: number; approved: number; coveragePct: number; draftPct: number }
interface BatchData { subjects: (TreeNode & { stats: SubjectStats })[]; jobs: Job[]; formats: AssetFormat[]; budget: number; spentUsd: number }
type BasketItem = JobItem & { atoms: number; feasible?: number };
// Preflight "đủ điều kiện sản xuất" — cùng luật với runner, tính TRƯỚC khi thêm vào đơn
interface Preflight { kind: string; atoms: number; total: number; willRun: number; fresh?: number; redraft?: number; keep?: number; noPkg?: number; existing?: number }
// Bản đồ sản xuất: mỗi node = a (nguyên tử) / p (đã có gói) / s (đã có học liệu)
type Cov = Record<string, { a: number; p: number; s: number }>;

// Chip trạng thái ✓ / ◐ / ✗ — dùng chung cho cây phạm vi
function CovChip({ st }: { st?: { a: number; p: number; s: number } }) {
  if (!st || st.a === 0) return null;
  if (st.s === st.a) return <span title={`Đã có học liệu đủ ${st.s}/${st.a} nguyên tử`} className="shrink-0 rounded-full bg-ok-bg px-1.5 py-0.5 text-[10px] font-bold text-ok">✓</span>;
  if (st.p === 0 && st.s === 0) return <span title="Chưa nháp gói nào" className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">✗</span>;
  return <span title={`Gói ${st.p}/${st.a} · Học liệu ${st.s}/${st.a} nguyên tử`} className="shrink-0 whitespace-nowrap rounded-full bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn">◐ {st.s}/{st.a}</span>;
}

const KIND_LABEL: Record<string, string> = { subject: "Môn", grade: "Lớp", chapter: "Chương", lesson: "Bài", point: "Điểm KT", atom: "Nguyên tử" };
const STATUS_TONE: Record<string, string> = {
  running: "bg-info-bg text-info", paused: "bg-warn-bg text-warn", done: "bg-ok-bg text-ok", failed: "bg-danger-bg text-danger", stopped: "bg-surface-2 text-ink-2",
};

function BatchInner() {
  const [me, setMe] = useState<User | null>(null);
  const [data, setData] = useState<BatchData | null>(null);
  const [toast, show] = useToast();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const params = useSearchParams();

  // ── builder ──
  const [subjectId, setSubjectId] = useState(() => params.get("subject") || ""); // ?subject= từ đồ thị/cây/atom trỏ về
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [cov, setCov] = useState<{ sid: string; map: Cov } | null>(null); // gắn sid → tự loại dữ liệu môn cũ, khỏi reset sync
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<TreeNode | null>(null);
  const wantNode = useRef<string | null>(params.get("node")); // ?node= → tự mở + chọn sẵn phạm vi
  const fromId = params.get("node") || "";                   // GIỮ lại để còn biết mình đến từ đâu mà quay về
  const [cfgKind, setCfgKind] = useState<"draft" | "asset">("draft");
  const [cfgFormats, setCfgFormats] = useState<Set<AssetFormat>>(new Set<AssetFormat>(["slide"]));
  const [cfgLevels, setCfgLevels] = useState<Set<number>>(new Set([1, 2, 3]));
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pf, setPf] = useState<{ key: string; d: Preflight } | null>(null); // gắn key cấu hình → tự loại bản cũ

  // khóa cấu hình hiện tại — đổi phạm vi/mức/định dạng là preflight cũ hết hiệu lực
  const pfKey = picked ? [picked.id, cfgKind, [...cfgLevels].sort().join(","), cfgKind === "asset" ? [...cfgFormats].sort().join(",") : ""].join("|") : "";
  useEffect(() => {
    if (!picked || cfgLevels.size === 0 || (cfgKind === "asset" && cfgFormats.size === 0)) return;
    const key = pfKey;
    const t = setTimeout(() => {
      getData<Preflight>("preflight", { id: picked.id, kind: cfgKind, levels: [...cfgLevels].sort().join(","), formats: cfgKind === "asset" ? [...cfgFormats].join(",") : "" })
        .then((d) => setPf({ key, d })).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pfKey]);
  const pfd = pf && pf.key === pfKey ? pf.d : null;

  const load = useCallback(() => { getData<BatchData>("batch").then(setData).catch((e) => show(e.message, "err")); }, [show]);

  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  // chưa chọn môn → mặc định môn đầu (đồng bộ trong render, có guard — pattern React chuẩn)
  if (data && !subjectId && data.subjects[0]) setSubjectId(data.subjects[0].id);

  // nạp cây + BẢN ĐỒ SẢN XUẤT của môn đang chọn
  useEffect(() => {
    if (!data || !subjectId) return;
    const sid = subjectId;
    getData<{ nodes: TreeNode[] }>("curriculum", { id: sid }).then((d) => {
      setNodes(d.nodes);
      // ?node= → mở sẵn chuỗi cha + chọn node (đường về từ đồ thị/cây/atom)
      const nid = wantNode.current;
      const target = nid ? d.nodes.find((n) => n.id === nid) : null;
      if (target) {
        wantNode.current = null;
        const ex = new Set([sid]);
        let p: string | null = target.parentId;
        while (p) { ex.add(p); p = d.nodes.find((n) => n.id === p)?.parentId ?? null; }
        setExpanded(ex); setPicked(target);
      } else { setExpanded(new Set([sid])); setPicked(null); }
    }).catch(() => {});
    getData<{ cov: Cov }>("prodCoverage", { id: sid }).then((d) => setCov({ sid, map: d.cov })).catch(() => {});
  }, [subjectId, data]);

  // poll khi có đơn đang chạy
  useEffect(() => {
    const running = data?.jobs.some((j) => j.status === "running");
    if (running && !timer.current) timer.current = setInterval(load, 1500);
    if (!running && timer.current) { clearInterval(timer.current); timer.current = null; }
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [data, load]);

  const childrenOf = useCallback((pid: string | null) => (nodes || []).filter((n) => n.parentId === pid).sort((a, b) => a.order - b.order), [nodes]);
  const countAtoms = useCallback((nid: string): number => {
    const self = (nodes || []).find((n) => n.id === nid);
    if (self?.kind === "atom") return 1;
    let c = 0; const walk = (pid: string) => { for (const k of childrenOf(pid)) { if (k.kind === "atom") c++; else walk(k.id); } };
    walk(nid); return c;
  }, [nodes, childrenOf]);

  if (!data) return <Shell user={me}><PageLoading /></Shell>;
  const isAdmin = me?.role === "admin";
  const subjectRoot = (nodes || []).find((n) => n.id === subjectId) || null;
  const covMap = cov && cov.sid === subjectId ? cov.map : null;

  // Đến từ một nguyên tử/chương cụ thể → dựng chuỗi cha để trang này KHÔNG mồ côi: người dùng phải
  // thấy mình đang ở phạm vi nào và có đường quay lại đúng chỗ vừa đứng.
  const fromNode = fromId ? (nodes || []).find((n) => n.id === fromId) || null : null;
  const fromChain: TreeNode[] = [];
  if (fromNode) {
    let c: TreeNode | undefined = fromNode;
    while (c) { fromChain.unshift(c); c = c.parentId ? (nodes || []).find((n) => n.id === c!.parentId) : undefined; }
  }

  const toggleFmt = (f: AssetFormat) => setCfgFormats((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const toggleLvl = (l: number) => setCfgLevels((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; });

  const addToBasket = () => {
    if (!picked) { show("Chọn một phạm vi trong cây trước", "err"); return; }
    if (cfgLevels.size === 0) { show("Chọn ít nhất một mức", "err"); return; }
    if (cfgKind === "asset" && cfgFormats.size === 0) { show("Chọn ít nhất một định dạng", "err"); return; }
    const atoms = countAtoms(picked.id);
    if (atoms === 0) { show("Phạm vi này chưa có nguyên tử nào", "err"); return; }
    setBasket((b) => [...b, {
      nodeId: picked.id, nodeTitle: picked.title, kind: cfgKind,
      formats: cfgKind === "asset" ? [...cfgFormats] : [], levels: [...cfgLevels].sort(), atoms,
      feasible: pfd?.willRun, // số tác vụ THỰC SỰ sẽ chạy (đã trừ thiếu gói / đã có bản / Chuẩn trường)
    }]);
    show(`Đã thêm “${picked.title}” vào đơn`);
  };
  const removeItem = (i: number) => setBasket((b) => b.filter((_, idx) => idx !== i));

  const estTasks = basket.reduce((s, it) => s + (it.feasible ?? it.atoms * it.levels.length * (it.kind === "asset" ? it.formats.length : 1)), 0);

  const startProduction = async () => {
    if (basket.length === 0) { show("Đơn sản xuất đang trống", "err"); return; }
    setBusy(true);
    try {
      const items = basket.map(({ nodeId, nodeTitle, kind, formats, levels }) => ({ nodeId, nodeTitle, kind, formats, levels }));
      const r = await api("buildJob", { title: title.trim(), items }) as { tasks: number };
      show(`Đã tạo đơn — ${r.tasks} tác vụ vào hàng đợi`);
      setBasket([]); setTitle("");
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  const control = async (id: string, action: "pause" | "resume" | "stop") => {
    try { await api("jobControl", { id, action }); load(); }
    catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
  };
  const del = async (id: string) => {
    if (!window.confirm("Xoá đơn sản xuất này khỏi nhật ký? Nội dung đã sinh vẫn được giữ.")) return;
    try { await api("jobDelete", { id }); load(); }
    catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink"><Cog size={24} strokeWidth={1.75} className="text-brand" aria-hidden />Xưởng sản xuất</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">Chạy AI hàng loạt theo <b className="text-ink">đơn sản xuất</b>. Mỗi dòng là một phạm vi + việc cần làm — trộn thoải mái, chạy tuần tự, có thể tạm dừng / dừng / xoá.</p>
          </div>
          <Card className="shrink-0 px-4 py-2.5 text-right">
            <p className="text-[11px] text-muted">Chi phí AI tháng này</p>
            <p className="font-display text-lg font-semibold text-ink">${data.spentUsd} <span className="text-xs font-normal text-muted">/ ${data.budget}</span></p>
          </Card>
        </div>

        {fromNode && (
          <Card className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-brand-line bg-brand-bg/50 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">Phạm vi chọn sẵn</span>
            {/* một dòng, cắt gọn — chuỗi cha dài (tên chương SGK rất dài) mà cho xuống dòng thì gãy vụn,
                dấu › rơi lửng lơ đầu dòng. Tên đầy đủ vẫn xem được ở tooltip. */}
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={fromChain.map((n) => n.title).join(" › ")}>
              {fromChain.map((n, i) => (
                <span key={n.id} className="whitespace-nowrap">
                  {i > 0 && <span className="mx-1 text-line-strong">›</span>}
                  <span className={i === fromChain.length - 1 ? "font-medium text-ink" : ""}><M>{n.title}</M></span>
                </span>
              ))}
            </span>
            <Link href={fromNode.kind === "atom" ? `/atom/${fromNode.id}` : `/tree?node=${fromNode.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand transition hover:underline">
              <ArrowLeft size={13} /> Quay lại {fromNode.kind === "atom" ? "nguyên tử" : "mục này"}
            </Link>
          </Card>
        )}

        {!isAdmin && (
          <Card className="mt-4 flex items-center gap-2 border-warn-line bg-warn-bg p-3.5 text-sm text-warn"><AlertTriangle size={16} className="shrink-0" />Chỉ Quản trị học thuật được vận hành xưởng — bạn đang ở chế độ theo dõi.</Card>
        )}

        <Card className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-brand-line bg-brand-bg/60 p-3.5 text-xs text-brand-ink">
          <span className="flex items-center gap-1.5"><FileText size={14} /><b>Nháp nội dung:</b> AI soạn gói kiến thức (tổng quan · giải thích · ví dụ · câu hỏi) cho mỗi nguyên tử × mức.</span>
          <span className="flex items-center gap-1.5"><Sparkles size={14} /><b>Sinh học liệu:</b> từ gói đã có, xuất ra slide / quiz / phiếu… (cần nháp nội dung trước).</span>
        </Card>

        {/* min-w-0 trên TỪNG ô lưới: ô grid mặc định min-width:auto → KHÔNG co nhỏ hơn nội dung bên trong,
            nên chữ dài trong thẻ (tên đơn, tên nguyên tử) đẩy cột phình ra ngoài mép phải. */}
        {/* items-start: KHÔNG kéo hai thẻ cao bằng nhau. Cột trái (cây) rất cao, nên nếu để giãn đều thì
            thẻ "Đơn sản xuất" bị bơm rỗng ở giữa và ô tên đơn + nút chạy bị đẩy rơi xuống tận đáy. */}
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ══ TRÁI: builder ══ */}
          <Card className={cls("min-w-0 p-4", !isAdmin && "pointer-events-none opacity-60")}>
            <h2 className="font-display text-base font-semibold text-ink">Tạo đơn sản xuất</h2>
            {/* chọn môn */}
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-medium text-muted">Môn</label>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand">
                {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>

            {/* tổng quan sản xuất của môn */}
            {covMap?.[subjectId] && (() => { const st = covMap[subjectId]; return (
              <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
                <div className="flex items-center justify-between text-[11px] text-ink-2">
                  <span><b className="text-ink">{st.s}</b>/{st.a} nguyên tử đã có học liệu · <b className="text-ink">{st.p}</b>/{st.a} đã có gói</span>
                  <span className="font-semibold text-ink">{st.a ? Math.round((st.s / st.a) * 100) : 0}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="relative h-full rounded-full bg-brass/45" style={{ width: `${st.a ? (st.p / st.a) * 100 : 0}%` }}>
                    <div className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: `${st.p ? (st.s / st.p) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            ); })()}

            {/* chú giải trạng thái */}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
              <span><b className="text-ok">✓</b> đủ học liệu</span>
              <span><b className="text-warn">◐ x/y</b> đang dở — x/y nguyên tử có học liệu</span>
              <span><b>✗</b> chưa làm gì</span>
            </p>

            {/* cây phạm vi — kiêm BẢN ĐỒ SẢN XUẤT */}
            <div className="mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface-2/40 p-1.5 scrollthin">
              {!nodes ? <p className="p-3 text-xs text-muted">Đang tải cây…</p> : subjectRoot ? (
                <TreeRow node={subjectRoot} depth={0} expanded={expanded} childrenOf={childrenOf} pickedId={picked?.id || null}
                  onToggle={(id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  onPick={setPicked} countAtoms={countAtoms} cov={covMap} />
              ) : <p className="p-3 text-xs text-muted">Không có dữ liệu.</p>}
            </div>

            {/* cấu hình dòng */}
            <div className="mt-3 rounded-lg border border-line bg-surface p-3">
              <p className="text-xs text-muted">Phạm vi đang chọn</p>
              <p className="truncate text-sm font-semibold text-ink">{picked ? <><M>{picked.title}</M> <span className="text-[11px] font-normal text-muted">· {KIND_LABEL[picked.kind]} · {countAtoms(picked.id)} nguyên tử</span></> : <span className="font-normal text-muted">— bấm một mục trong cây —</span>}</p>

              <div className="mt-3 flex gap-1.5">
                {([["draft", "Nháp nội dung", FileText], ["asset", "Sinh học liệu", Sparkles]] as const).map(([k, lbl, Icon]) => (
                  <button key={k} onClick={() => setCfgKind(k)} className={cls("flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition", cfgKind === k ? "border-brand bg-brand-bg text-brand-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                    <Icon size={14} /> {lbl}
                  </button>
                ))}
              </div>

              {cfgKind === "asset" && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-ink">Định dạng học liệu <span className="font-normal text-muted">(chọn nhiều)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.formats.map((f) => (
                      <button key={f} onClick={() => toggleFmt(f)} className={cls("flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition", cfgFormats.has(f) ? "border-brand bg-brand-bg text-brand-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                        <FormatIcon format={f} size={13} /> {FORMAT_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold text-ink">Mức độ</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((l) => (
                    <button key={l} onClick={() => toggleLvl(l)} className={cls("flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition", cfgLevels.has(l) ? "border-brand bg-brand-bg text-brand-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                      Mức {l}<span className="hidden sm:inline"> · {LEVEL_LABEL[l]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ĐỦ ĐIỀU KIỆN SẢN XUẤT? — soi trước, khỏi chạy mới biết trượt */}
              {picked && pfd && (
                pfd.kind === "draft" ? (
                  <div className="mt-3 rounded-lg border border-info bg-info-bg/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                    ✍ Sẽ nháp mới <b className="text-ink">{pfd.fresh}</b>{(pfd.redraft || 0) > 0 && <> · nháp lại <b className="text-ink">{pfd.redraft}</b> gói cũ</>}{(pfd.keep || 0) > 0 && <> · <b className="text-ok">giữ nguyên {pfd.keep} gói Chuẩn trường</b> (bỏ qua)</>}
                  </div>
                ) : pfd.willRun === 0 ? (
                  <div className="mt-3 rounded-lg border border-danger-line bg-danger-bg/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                    <b className="text-danger">✗ 0/{pfd.total} tác vụ đủ điều kiện.</b>{" "}
                    {(pfd.noPkg || 0) > 0 && <>Phạm vi này <b>chưa có gói nội dung</b> ở mức đã chọn — phải nháp trước.{" "}</>}
                    {(pfd.existing || 0) > 0 && (pfd.noPkg || 0) === 0 && <>Tất cả đã có bản sẵn — không cần sinh lại.{" "}</>}
                    {(pfd.noPkg || 0) > 0 && <button onClick={() => setCfgKind("draft")} className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">→ Chuyển sang Nháp nội dung</button>}
                  </div>
                ) : pfd.willRun < pfd.total ? (
                  <div className="mt-3 rounded-lg border border-warn-line bg-warn-bg/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
                    <b className="text-warn">◐ Khả thi {pfd.willRun}/{pfd.total} tác vụ.</b>{" "}
                    Bỏ qua: {(pfd.noPkg || 0) > 0 && <><b>{pfd.noPkg}</b> chưa có gói ở mức đã chọn{(pfd.existing || 0) > 0 && " · "}</>}{(pfd.existing || 0) > 0 && <><b>{pfd.existing}</b> đã có bản sẵn</>}.
                    {(pfd.noPkg || 0) > 0 && <> <button onClick={() => setCfgKind("draft")} className="font-semibold text-brand underline underline-offset-2 hover:opacity-80">→ Nháp phần thiếu trước</button></>}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-ok-line bg-ok-bg/50 px-3 py-2 text-[11.5px] text-ink-2">
                    <b className="text-ok">✓ Đủ điều kiện:</b> {pfd.willRun} tác vụ sẽ chạy.
                  </div>
                )
              )}

              <Button onClick={addToBasket} disabled={!picked || (pfd ? pfd.willRun === 0 : false)} className="mt-3 w-full justify-center"><Plus size={15} strokeWidth={2} /> Thêm vào đơn</Button>
            </div>
          </Card>

          {/* ══ PHẢI: giỏ đơn + nút chạy ══ (dính theo mắt khi cuộn cây dài bên trái) */}
          <Card className="flex min-w-0 flex-col p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Đơn sản xuất</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">{basket.length} dòng · ~{estTasks} tác vụ</span>
            </div>
            <div className="mt-3 space-y-2">
              {basket.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong text-center text-xs text-muted">
                  <Info size={22} strokeWidth={1.5} className="mb-1.5 opacity-50" />
                  Chưa có dòng nào. Chọn phạm vi bên trái rồi “Thêm vào đơn”.
                </div>
              ) : basket.map((it, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-line bg-surface p-2.5">
                  <span className={cls("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", it.kind === "asset" ? "bg-brand-bg text-brand-ink" : "bg-info-bg text-info")}>
                    {it.kind === "asset" ? <Sparkles size={14} /> : <FileText size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink"><M>{it.nodeTitle}</M></p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5">{it.kind === "asset" ? "Sinh học liệu" : "Nháp nội dung"}</span>
                      <span>{it.atoms} nt × mức {it.levels.join(",")}</span>
                      {it.feasible != null && <span className="rounded bg-ok-bg px-1.5 py-0.5 font-semibold text-ok">{it.feasible} khả thi</span>}
                      {it.kind === "asset" && it.formats.map((f) => <span key={f} className="rounded bg-brand-bg px-1.5 py-0.5 text-brand-ink">{FORMAT_LABEL[f]}</span>)}
                    </p>
                  </div>
                  <button onClick={() => removeItem(i)} className="shrink-0 rounded-md p-1 text-muted transition hover:bg-danger-bg hover:text-danger" aria-label="Bỏ dòng"><X size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên đơn (vd: Nháp Toán 7 chương I)" className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
              <Button onClick={startProduction} disabled={busy || basket.length === 0 || !isAdmin} className="w-full justify-center"><Wand2 size={16} strokeWidth={1.75} /> {busy ? "Đang tạo…" : "Bắt đầu sản xuất"}</Button>
            </div>
          </Card>
        </div>

        {/* ══ Nhật ký đơn ══ */}
        <h2 className="mt-8 mb-3 font-display text-lg font-semibold text-ink">Nhật ký sản xuất</h2>
        <div className="space-y-3">
          {data.jobs.length === 0 && <Card className="p-4 text-sm text-muted">Chưa có đơn nào.</Card>}
          {data.jobs.map((j) => {
            const pct = j.total ? Math.round((j.done / j.total) * 100) : j.status === "running" ? 5 : 100;
            const done = j.tasks?.filter((t) => t.status === "done").length ?? j.done;
            const skipped = j.tasks?.filter((t) => t.status === "skipped").length ?? 0;
            return (
              <Card key={j.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cls("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[j.status] || "bg-surface-2 text-ink-2")}>{JOB_STATUS_LABEL[j.status] || j.status}</span>
                  <b className="font-semibold text-ink">{j.title}</b>
                  <span className="text-xs text-muted">{j.items?.length ?? 0} dòng · {j.total} tác vụ</span>
                  <span className="ml-auto text-xs text-muted">{j.by} · {timeAgo(j.startedAt)}</span>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {j.status === "running" && <IconBtn title="Tạm dừng" onClick={() => control(j.id, "pause")}><Pause size={14} /></IconBtn>}
                      {j.status === "paused" && <IconBtn title="Tiếp tục" onClick={() => control(j.id, "resume")}><Play size={14} /></IconBtn>}
                      {(j.status === "running" || j.status === "paused") && <IconBtn title="Dừng hẳn" onClick={() => control(j.id, "stop")}><Square size={13} /></IconBtn>}
                      <IconBtn title="Xoá" danger onClick={() => del(j.id)}><Trash2 size={14} /></IconBtn>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Progress value={pct} tone={j.status === "failed" ? "warn" : j.status === "done" ? "ok" : "brand"} className="flex-1" />
                  <span className="text-xs font-semibold text-ink-2">{done}/{j.total}</span>
                  <span className="text-xs text-muted">{skipped ? `${skipped} bỏ qua · ` : ""}{j.tokens.toLocaleString("vi-VN")} tok · ${j.costUsd}</span>
                </div>
                {/* sản xuất xong → vào thẳng chỗ vừa làm để xem/duyệt/làm tiếp */}
                {(j.items?.length ?? 0) > 0 && (j.status === "done" || j.status === "failed" || j.status === "stopped") && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted">Mở kết quả:</span>
                    {j.items.slice(0, 6).map((it, i) => (
                      <a key={i} href={`/graph?node=${it.nodeId}`}
                        className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-brand-line bg-brand-bg px-2.5 py-1 text-[11px] font-medium text-brand-ink transition hover:bg-brand hover:text-white">
                        <span className="truncate"><M>{it.nodeTitle}</M></span> →
                      </a>
                    ))}
                    <a href="/library" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2 transition hover:border-brand hover:text-brand">Kho học liệu →</a>
                  </div>
                )}
                {j.log?.length > 0 && (
                  <div className="mt-2 max-h-28 overflow-y-auto rounded-md bg-sink p-3 font-mono text-[11px] leading-relaxed text-ink-2 scrollthin">
                    {j.log.map((l, i) => <p key={i}>{l}</p>)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

export default function BatchPage() {
  return <Suspense fallback={<Shell user={null}><PageLoading /></Shell>}><BatchInner /></Suspense>;
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} title={title} aria-label={title} className={cls("grid h-7 w-7 place-items-center rounded-md border border-line text-ink-2 transition hover:bg-surface-2", danger && "hover:border-danger-line hover:bg-danger-bg hover:text-danger")}>{children}</button>;
}

function TreeRow({ node, depth, expanded, childrenOf, pickedId, onToggle, onPick, countAtoms, cov }: {
  node: TreeNode; depth: number; expanded: Set<string>; childrenOf: (pid: string | null) => TreeNode[]; pickedId: string | null;
  onToggle: (id: string) => void; onPick: (n: TreeNode) => void; countAtoms: (id: string) => number; cov: Cov | null;
}) {
  const kids = childrenOf(node.id);
  const canExpand = node.kind !== "atom" && kids.length > 0;
  const open = expanded.has(node.id);
  const picked = pickedId === node.id;
  return (
    <div>
      <div className={cls("group flex items-center gap-1 rounded-md px-1.5 py-1 transition", picked ? "bg-brand-bg" : "hover:bg-surface-2")} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
        {canExpand ? (
          <button onClick={() => onToggle(node.id)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:text-ink" aria-label={open ? "Thu gọn" : "Mở"}>
            <ChevronRight size={14} className={cls("transition-transform", open && "rotate-90")} />
          </button>
        ) : <span className="w-5 shrink-0" />}
        <button onClick={() => onPick(node)} className="flex min-w-0 flex-1 items-baseline gap-1.5 py-0.5 text-left">
          <span className={cls("truncate text-[13px]", picked ? "font-semibold text-brand-ink" : "text-ink")}><M>{node.title}</M></span>
          <span className="shrink-0 text-[10px] text-muted">{KIND_LABEL[node.kind]}{node.kind !== "atom" ? ` · ${countAtoms(node.id)} nt` : ""}</span>
        </button>
        <CovChip st={cov?.[node.id]} />
      </div>
      {canExpand && open && kids.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} expanded={expanded} childrenOf={childrenOf} pickedId={pickedId} onToggle={onToggle} onPick={onPick} countAtoms={countAtoms} cov={cov} />
      ))}
    </div>
  );
}
