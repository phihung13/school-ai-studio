"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Layers, FolderTree, FileText, Target, Sparkles, Sprout, ArrowLeft, type LucideIcon } from "lucide-react";
import { cls } from "./ui";
import { readableMath } from "@/lib/shared";

export interface TMNode { id: string; kind: "subject" | "grade" | "chapter" | "lesson" | "point" | "atom"; parentId: string | null; title: string; code: string; order: number; atomType: string | null; verified: boolean; atomCount: number; cover: "empty" | "partial" | "full"; status: string | null }

const KIND_ICON: Record<TMNode["kind"], LucideIcon> = { subject: BookOpen, grade: Layers, chapter: FolderTree, lesson: FileText, point: Target, atom: Sparkles };
const KIND_LABEL: Record<TMNode["kind"], string> = { subject: "môn", grade: "lớp", chapter: "chương", lesson: "bài", point: "điểm KT", atom: "nguyên tử" };
// nhãn cấp CON (để ghi "10 chương", "6 bài"…)
const CHILD_LABEL: Record<string, string> = { root: "môn", subject: "lớp", grade: "chương", chapter: "bài", lesson: "điểm KT", point: "nguyên tử" };
// bảng màu TOÀN TÔNG XANH (đậm–nhạt–ngọc–lá) để nhìn như cây
const PAL = ["#4E9E4A", "#3E9C72", "#6BB24E", "#2E8B6B", "#7FB93E", "#57A05A", "#3E8C6A", "#8AB84A", "#2F9C57", "#6FA83A", "#4F9A6E", "#93BE55"];
const COVER_COLOR: Record<string, string> = { full: "#2E9C6A", partial: "#D9902E", empty: "#B8B4AC" };
const STATUS_COLOR: Record<string, string> = { approved: "#1D9E75", pending_review: "#C79A2E", edited: "#3E6FA3", draft_ai: "#C08A34" };
function dotColor(n: TMNode): string { return n.kind === "atom" ? (n.status ? STATUS_COLOR[n.status] || "#B8B4AC" : "#B8B4AC") : COVER_COLOR[n.cover]; }

// Đường gấp khúc BO TRÒN mọi góc: pts = các đỉnh, radius = bán kính bo (tự thu nếu đoạn ngắn).
function roundedPath(pts: [number, number][], radius: number): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0) || 1, d2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const ax = x1 - (x1 - x0) / d1 * r, ay = y1 - (y1 - y0) / d1 * r;
    const bx = x1 + (x2 - x1) / d2 * r, by = y1 + (y2 - y1) / d2 * r;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${x1.toFixed(1)},${y1.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
  return d;
}

export default function MindTree({ nodes, initialFocus, onPickAtom, onNavigate }: {
  nodes: TMNode[]; initialFocus?: string | null; onPickAtom: (id: string) => void; onNavigate?: (id: string | null) => void;
}) {
  const byId = useMemo(() => { const m: Record<string, TMNode> = {}; for (const n of nodes) m[n.id] = n; return m; }, [nodes]);
  const childrenOf = useMemo(() => { const m: Record<string, TMNode[]> = { "": [] }; for (const n of nodes) { const k = n.parentId || ""; (m[k] ||= []).push(n); } for (const k in m) m[k].sort((a, b) => a.order - b.order); return m; }, [nodes]);

  const [focusId, setFocusId] = useState<string | null>(initialFocus || null);
  useEffect(() => { if (initialFocus !== undefined) setFocusId(initialFocus || null); }, [initialFocus]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) setSize((s) => (s.w === w && s.h === h ? s : { w, h })); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    window.addEventListener("resize", measure);
    const r1 = requestAnimationFrame(measure), r2 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t = setTimeout(measure, 160);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
  }, []);

  const focus = focusId ? byId[focusId] : null;
  const kids = childrenOf[focusId || ""] || [];

  const nav = (id: string | null) => { setFocusId(id); onNavigate?.(id); };
  const open = (n: TMNode) => {
    const hasKids = (childrenOf[n.id] || []).length > 0;
    if (n.kind === "atom" || !hasKids) { onPickAtom(n.id); return; }
    nav(n.id);
  };

  const { w, h } = size;
  const cx = w / 2, cy = h * 0.44;
  const n = kids.length;
  const centerR = Math.max(42, Math.min(w, h) * 0.10);
  const SPAN = n <= 3 ? 150 : n <= 6 ? 210 : 252;      // càng nhiều node càng toả rộng
  const ringRx = w * 0.38 - 40;
  const ringRy = h * 0.38 - 40;
  const pos = kids.map((k, i) => {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const ang = ((-SPAN / 2 + frac * SPAN) * Math.PI) / 180;
    return { k, i, x: cx + ringRx * Math.sin(ang), y: cy - ringRy * Math.cos(ang) };
  });
  // BÁN KÍNH bong bóng TỰ CO ≤ nửa khoảng cách gần nhất − đệm → KHÔNG BAO GIỜ đè, dù màn rộng-thấp
  let minD = Infinity;
  for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) { const dd = Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y); if (dd < minD) minD = dd; }
  const bubbleR = Math.max(18, Math.min(46, Math.min(w, h) * 0.08, minD / 2 - 14));

  const totalAtoms = focus ? focus.atomCount : nodes.filter((x) => x.kind === "subject").reduce((s, x) => s + x.atomCount, 0);
  const CenterIcon = focus ? KIND_ICON[focus.kind] : Sprout;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Sân khấu sơ đồ */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line" style={{ background: "radial-gradient(120% 100% at 50% 0%, #fbfdfb 0%, var(--color-canvas) 70%)" }}>
        {focus && (
          <button onClick={() => nav(focus.parentId)} title="Lùi lại một tầng"
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-line bg-surface/90 px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-sm backdrop-blur transition hover:border-brand hover:text-brand">
            <ArrowLeft size={15} strokeWidth={2} /> Quay lại
          </button>
        )}
        {w > 0 && (
          <div key={focusId || "root"} className="mt-scene absolute inset-0">
            {/* dây nối + thân + rễ (SVG) */}
            <svg className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
              {/* thân + rễ (xanh) — thân thẳng đứng, rễ toả gấp khúc ở đáy */}
              <g stroke="#AECBA6" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d={`M${cx},${cy + centerR + 46} L${cx},${h * 0.88}`} strokeWidth={5} />
                {[-1, -0.5, 0.5, 1].map((s, i) => (
                  <path key={i} d={`M${cx},${h * 0.88} L${cx + s * 20},${h * 0.925} L${cx + s * 60},${h * 0.98}`} strokeWidth={2.4} opacity={0.7} />
                ))}
              </g>
              {/* CÀNH: thân → (bo) rẽ ngang → (bo) chui vào node — 2 khúc cong, bo mạnh */}
              {pos.map(({ k, x, y, i }) => {
                const dx = x - cx, dy = y - cy;
                const dotCol = PAL[i % PAL.length];
                const horiz = Math.abs(dx) >= Math.abs(dy) * 1.05;
                let d: string, dotY: number;
                if (horiz) {
                  // MÔN HÔNG: thân dọc tới ngang tầm node → bo 1 góc → chạy NGANG DÀI đâm thẳng vào node
                  const hdir = dx >= 0 ? 1 : -1;
                  const vdir = dy >= 0 ? 1 : -1;
                  const exY = cy + vdir * (centerR - 5);
                  const nx = x - hdir * (bubbleR + 2);
                  d = roundedPath([[cx, exY], [cx, y], [nx, y]], 30);
                  dotY = y;
                } else {
                  // MÔN ĐỈNH/ĐÁY: thân dọc → bo → ngang tới cột node → bo → chạy DỌC DÀI đâm thẳng vào node
                  const vdir = dy >= 0 ? 1 : -1;
                  const exY = cy + vdir * (centerR - 5);
                  const stub = Math.max(46, Math.abs(dy) * 0.5);   // đoạn cuối dài ≥46px (~1.2cm)
                  const yH = y - vdir * (bubbleR + stub);
                  const ny = y - vdir * (bubbleR + 2);
                  d = roundedPath([[cx, exY], [cx, yH], [x, yH], [x, ny]], 30);
                  dotY = yH;
                }
                return (
                  <g key={k.id}>
                    <path d={d} fill="none" stroke="#9DC196" strokeOpacity={0.6} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                    <path className="mt-dash" d={d} fill="none" stroke={dotCol} strokeOpacity={0.85} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={cx} cy={dotY} r={5} fill={dotCol} />
                    <circle cx={cx} cy={dotY} r={5} fill="none" stroke="#fff" strokeWidth={1.6} />
                  </g>
                );
              })}
            </svg>

            {/* TÂM */}
            <button onClick={() => focus && nav(focus.parentId)} title={focus ? "Bấm để lùi một tầng" : "Toàn bộ chương trình"}
              className="absolute -translate-x-1/2 -translate-y-1/2 select-none" style={{ left: cx, top: cy, cursor: focus ? "pointer" : "default" }}>
              <span className="relative grid place-items-center rounded-full text-white shadow-lg transition hover:brightness-105"
                style={{ width: centerR * 2, height: centerR * 2, background: "radial-gradient(130% 130% at 30% 25%, #6FBE63 0%, #2E9C6A 60%, #26896A 100%)", boxShadow: "0 10px 30px -8px rgba(40,120,80,.5)" }}>
                <span className="absolute -top-2 left-1/2 -translate-x-1/2"><Sprout size={Math.max(18, centerR * 0.42)} className="text-brand" strokeWidth={2} fill="#DDF0DC" /></span>
                <CenterIcon size={centerR * 0.44} strokeWidth={1.6} className="opacity-95" />
              </span>
              <span className="absolute left-1/2 top-full mt-2 w-44 -translate-x-1/2 text-center">
                <span className="block truncate font-display text-sm font-semibold text-ink">{readableMath(focus ? focus.title : "Chương trình Việt Anh")}</span>
                <span className="block text-[11px] text-muted">{totalAtoms} nguyên tử{focus ? "" : " · " + nodes.filter((x) => x.kind === "subject").length + " môn"}{focus && <> · bấm lùi ↩</>}</span>
              </span>
            </button>

            {/* BONG BÓNG con */}
            {pos.map(({ k, x, y, i }) => {
              const col = PAL[i % PAL.length];
              const Icon = KIND_ICON[k.kind];
              const childCount = (childrenOf[k.id] || []).length;
              const dc = dotColor(k);
              const dx = x - cx, dy = y - cy;
              const horiz = Math.abs(dx) >= Math.abs(dy) * 1.05;
              // nhãn ra PHÍA NGOÀI, không nằm trên dây nối
              const capCls = horiz
                ? (dx >= 0 ? "left-full top-1/2 ml-2.5 -translate-y-1/2 text-left" : "right-full top-1/2 mr-2.5 -translate-y-1/2 text-right")
                : (dy >= 0 ? "left-1/2 top-full mt-2 -translate-x-1/2 text-center" : "left-1/2 bottom-full mb-2 -translate-x-1/2 text-center");
              return (
                <button key={k.id} onClick={() => open(k)}
                  className="mt-bubble group absolute -translate-x-1/2 -translate-y-1/2 select-none outline-none" style={{ left: x, top: y, animationDelay: `${i * 40}ms` }}>
                  <span className="relative grid place-items-center rounded-full text-white shadow-md transition-transform duration-200 group-hover:scale-110"
                    style={{ width: bubbleR * 2, height: bubbleR * 2, background: `linear-gradient(140deg, color-mix(in srgb, ${col} 62%, #fff), ${col})`, boxShadow: `0 8px 20px -8px ${col}99` }}>
                    <Icon size={bubbleR * 0.62} strokeWidth={1.7} className="opacity-95" />
                    <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: dc }} title={k.kind === "atom" ? (k.status || "chưa có gói") : k.cover} />
                    {k.kind !== "atom" && childCount > 0 && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 text-[10px] font-semibold text-ink-2 shadow-sm ring-1 ring-line">{childCount}</span>
                    )}
                  </span>
                  <span className={cls("absolute w-24", capCls)}>
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink">{readableMath(k.title)}</span>
                    <span className="mt-0.5 block text-[9px] text-muted">{k.kind === "atom" ? k.code : `${childCount} ${CHILD_LABEL[k.kind] || "mục"} · ${k.atomCount} nt`}</span>
                  </span>
                </button>
              );
            })}

            {kids.length === 0 && (
              <div className="absolute left-1/2 top-[62%] w-64 -translate-x-1/2 text-center text-sm text-muted">
                Mục này chưa có nhánh con. {focus?.kind === "atom" ? "" : "Hãy phân rã thêm ở Quản lý chương trình."}
              </div>
            )}
          </div>
        )}

        {/* chú thích */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-line bg-surface/85 px-3 py-1 text-[11px] text-ink-2 shadow-sm backdrop-blur">
          {([["full", "Đủ"], ["partial", "Thiếu"], ["empty", "Chưa có"]] as const).map(([c, l]) => (
            <span key={c} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COVER_COLOR[c] }} />{l}</span>
          ))}
          <span className="text-muted">· bấm bong bóng để mở tầng sâu hơn</span>
        </div>
      </div>
    </div>
  );
}
