"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, type Simulation } from "d3-force";
import {
  EdgeRelation, RELATION_HEX, RELATION_LABEL, RELATION_COLOR, ATOM_TYPE_LABEL, ATOM_TYPE_COLOR,
  AtomType, PkgStatus, STATUS_LABEL, PKG_STATUS_COLOR, FIELD_LABEL, LEVEL_LABEL, readableMath,
} from "@/lib/shared";
import { cls, getData, richNodes, mathNodes } from "./ui";
import { ArrowUpRight, X, BookOpen, Lightbulb, AlertTriangle, Compass, Link2, GraduationCap, Layers, ListChecks, Check } from "lucide-react";

interface GNode { id: string; code: string; title: string; atomType: AtomType | null; dok: number | null; bloom: string | null; nangLuc?: string | null; yeuCau?: string | null; verified: boolean; ch: number; chTitle: string; lessonId?: string; lessonTitle?: string; subject?: string; subjectId?: string; grade?: number | null; ci?: number; inScope?: boolean; kind?: string; atomCount?: number; edgeCount?: number; x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null; dx?: number; dy?: number; h1?: number; h2?: number; }
interface GEdge { id: string; from: string; to: string; relation: EdgeRelation; weight: number; quanNiemSai?: string; remediationHint?: string; tanSuat?: string; bloomGap?: number; crossSubject?: string; }
interface SimLink { source: GNode; target: GNode; relation: EdgeRelation; weight: number; e: GEdge; seed: number; }

interface Pkg { id: string; level: number; status: PkgStatus; bloom: string; fields: Record<string, string> }
interface Question { id: string; atomId: string; noiDung: string; tier?: string; dok?: number; doKho?: string; dapAn?: string; loiGiai?: string; nhieu?: { noiDung: string; lyDo?: string }[] }
interface AtomDetail { atom: { title: string; code: string; nangLuc?: string; yeuCau?: string; quanNiemSai?: string; atomType?: AtomType }; ancestors: { title: string; kind: string }[]; packages: (Pkg | null)[]; refs: { id: string; title: string; url: string; kind: string; from: string }[]; questions?: Question[] }

// nền SÁNG (canvas trong suốt, lấy màu wrapper) + bảng màu TRẦM đậm để node nổi bật
const CH = ["#3F7A2E", "#2E8B6B", "#4E9E4A", "#2E9C6A", "#5E7A1E", "#3E8C6A", "#6FA83A", "#2F8B57", "#4F9A6E", "#7FB93E"];
// Toàn cảnh: tô màu theo MÔN để phân biệt (dịu, hợp tông web); focus 1 môn vẫn dùng CH theo chương.
const SUBJ_HEX: Record<string, string> = { toan: "#c99a2e", nguvan: "#c65a44", tienganh: "#3a7fb0", khtn: "#2f9e63", gdcd: "#8a6fc0", congnghe: "#5570b8", vatli: "#c85a7a", hoahoc: "#2f9e8b", sinhhoc: "#7a9e30", diali: "#cf8433", gdktpl: "#b05a92", oxford: "#2f9ea0" };
const subjHex = (n: GNode) => SUBJ_HEX[n.subjectId || ""] || CH[n.ch % CH.length];
const hexA = (h: string, a: number) => { const n = parseInt(h.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const anyCtx = ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
  if (anyCtx.roundRect) { ctx.beginPath(); anyCtx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapLabel(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines); let last = kept[maxLines - 1];
  while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
  kept[maxLines - 1] = last + "…"; return kept;
}
// markdown nhẹ: **đậm**, gạch đầu dòng, đánh số, ⚠/→
// dùng CHUNG bộ hiển thị của ui.tsx: mũ/chỉ số ra <sup>/<sub> thật + **in đậm**
const boldParts = (s: string): React.ReactNode[] => richNodes(s);
function renderRich(text: string): React.ReactNode {
  return text.split(/\n/).map((raw, i) => {
    const indent = raw.match(/^\s*/)?.[0].length || 0;
    const ln = readableMath(raw, { marks: true });   // đánh dấu mũ/chỉ số; các regex nhận diện dưới đây không đụng dấu
    if (!ln) return <div key={i} className="h-1.5" />;
    const num = ln.match(/^(\d+[.)])\s+(.*)$/);
    const isBullet = /^[•\-*]\s+/.test(ln);
    const arrow = /^→/.test(ln), warn = /^⚠/.test(ln);
    const pad = indent >= 3 ? "pl-3.5" : "";
    if (num) return <div key={i} className={cls("flex gap-1.5", pad)}><span className="shrink-0 font-semibold text-brand">{num[1]}</span><span>{boldParts(num[2])}</span></div>;
    if (isBullet) return <div key={i} className={cls("flex gap-1.5", pad)}><span className="shrink-0 text-brand">•</span><span>{boldParts(ln.replace(/^[•\-*]\s+/, ""))}</span></div>;
    return <div key={i} className={cls(pad, arrow && "text-ok", warn && "font-medium text-danger")}>{boldParts(ln)}</div>;
  });
}

export default function GraphView({ nodes: raw, edges: rawEdges, rootTitle, onOpenAtom, focusAtom, showLegend = true, filterSubjects = null, filterGrades = null, filterChapters = null, filterVerOnly = false, colorMode = "chapter", filterKey = "" }: {
  nodes: GNode[]; edges: GEdge[]; rootTitle: string; onOpenAtom: (id: string) => void; focusAtom?: string; showLegend?: boolean;
  filterSubjects?: Set<string> | null; filterGrades?: Set<number> | null; filterChapters?: Set<number> | null; filterVerOnly?: boolean; colorMode?: "subject" | "chapter"; filterKey?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Khung thông tin bên phải LUÔN HIỆN — chỉ kéo mép trái để rộng/hẹp (kẹp min, KHÔNG bao giờ đóng/biến mất).
  const [panelW, setPanelW] = useState(384);            // 24rem mặc định
  useEffect(() => {
    try { const w = +(localStorage.getItem("va_graph_panel_w") || ""); if (w >= 300) setPanelW(w); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("va_graph_panel_w", String(panelW)); } catch { /* ignore */ }
  }, [panelW]);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const right = rootRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const w = right - ev.clientX;                      // panel bên PHẢI: mép phải cố định, kéo mép trái
      setPanelW(Math.min(Math.max(w, 300), Math.min(680, right - 160))); // kẹp [300, …]: hẹp nhất vẫn rõ, không đóng
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";             // không bôi đen chữ khi kéo
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AtomDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [lvl, setLvl] = useState<number>(0); // index gói đang xem (0..2)
  // data đổi → reset selection NGAY TRONG RENDER (pattern reset-on-prop-change, thay setState-trong-effect)
  const [prevData, setPrevData] = useState<{ raw: GNode[]; edges: GEdge[] } | null>(null);
  if (prevData?.raw !== raw || prevData?.edges !== rawEdges) {
    setPrevData({ raw, edges: rawEdges });
    setSel(null); setSelEdge(null); setHoverId(null); setDetail(null);
  }

  const S = useRef({
    nodes: [] as GNode[], links: [] as SimLink[], byId: new Map<string, GNode>(), linkById: new Map<string, SimLink>(),
    sim: null as Simulation<GNode, undefined> | null,
    view: { x: 0, y: 0, k: 1, rot: 0 }, size: { W: 800, H: 600, dpr: 1 },
    hoverId: null as string | null, selId: null as string | null, near: null as Set<string> | null, hoverNear: null as Set<string> | null,
    selEdgeId: null as string | null, hoverEdgeId: null as string | null,
    drag: null as { node: GNode | null; sx: number; sy: number; px: number; py: number; moved: boolean } | null,
    ptrs: new Map<number, { x: number; y: number }>(), pinch: null as number | null, // theo dõi ngón tay → chụm 2 ngón (cảm ứng)
    deg: {} as Record<string, number>, fitted: false, now: 0, live: false, dirty: true, detail: false, colorMode: "chapter" as "subject" | "chapter",
    filter: { subjects: null as Set<string> | null, grades: null as Set<number> | null, chapters: null as Set<number> | null, verOnly: false },
    // "ngân hà" toàn cảnh: cụm sao nướng sẵn thành sprite + trôi + dây giả + chớp sáng
    clusters: [] as { key: string; label: string; color: string; cx: number; cy: number; maxR: number; count: number; ver: number; visCount: number; sprite: HTMLCanvasElement | null; dim: number; amp1: number; amp2: number; w1: number; w2: number; w3: number; w4: number; p1: number; p2: number; p3: number; p4: number; bw: number; bp: number; ox: number; oy: number; nodes: GNode[]; links: SimLink[] }[],
    ghost: [] as { a: number; b: number; s1: number; s2: number; pulse: boolean }[],
    twinkles: [] as { n: GNode; ci: number; ph: number; sp: number }[],
    // "tế bào sống": nhịp đập giãn-thu của từng nguyên tử (ambient + burst khi bấm)
    pulses: [] as { n: GNode; ci: number | null; t0: number }[],
    lastPulse: 0,
    driftT: 0, lastNow: 0,
    focusT: 0, hoverT: 0,                                    // mức làm mờ nền khi CHỌN (fade) + độ phồng node khi RÊ
    target: null as { x: number; y: number; k: number; rot: number } | null,
  });

  const deg = useMemo(() => { const d: Record<string, number> = {}; for (const e of rawEdges) { d[e.from] = (d[e.from] || 0) + 1; d[e.to] = (d[e.to] || 0) + 1; } return d; }, [rawEdges]);
  function rNode(n: GNode) {
    return 3.5 + Math.min(15, S.current.deg[n.id] || 0) * 1.55 + (n.dok || 1) * 0.5;
  }
  function neighborsSet(id: string | null) { const s = new Set<string>(); if (!id) return s; s.add(id); for (const l of S.current.links) { if (l.source.id === id) s.add(l.target.id); if (l.target.id === id) s.add(l.source.id); } return s; }
  // Lọc = ẩn/hiện TẠI CHỖ (không dựng lại layout): điểm nào không khớp bộ lọc thì không vẽ/không bắt.
  function visible(n: GNode) { const f = S.current.filter; if (f.subjects && !f.subjects.has(n.subjectId || "")) return false; if (f.grades && n.grade != null && !f.grades.has(n.grade)) return false; if (f.chapters && !f.chapters.has(n.ch)) return false; if (f.verOnly && !n.verified) return false; return true; }
  // độ trôi hiện tại: ngân hà = trôi CỤM; chi tiết = trôi CÁ NHÂN từng nguyên tử (dx/dy)
  function nOff(n: GNode) { const c = n.ci != null ? S.current.clusters[n.ci] : undefined; return c ? { x: c.ox, y: c.oy } : { x: n.dx || 0, y: n.dy || 0 }; }
  // Nướng mỗi cụm thành 1 sprite (halo ∝ tỷ lệ thẩm định + cạnh + hạt) → mỗi khung chỉ drawImage ~40 lần, mượt 60fps
  function bakeClusters() {
    const st = S.current;
    for (const c of st.clusters) {
      c.visCount = c.nodes.reduce((x, n) => x + (visible(n) ? 1 : 0), 0);
      if (!c.visCount) { c.sprite = null; continue; }        // cụm bị lọc trống → không vẽ gì (kể cả quầng sáng)
      const pad = 34, R = c.maxR + pad, dim = Math.ceil(R * 2), B = 1.3;
      const cvs = document.createElement("canvas"); cvs.width = Math.ceil(dim * B); cvs.height = Math.ceil(dim * B);
      const g = cvs.getContext("2d"); if (!g) continue;
      g.scale(B, B); g.translate(R, R);
      const vr = c.count ? c.ver / c.count : 0;
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, R * 0.9);
      gr.addColorStop(0, hexA(c.color, 0.05 + 0.13 * vr)); gr.addColorStop(1, hexA(c.color, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 6.2832); g.fill();
      g.lineCap = "round"; g.lineWidth = 0.7;
      for (const rel of ["prerequisite_hard", "related_soft", "misconception"] as EdgeRelation[]) {
        g.strokeStyle = hexA(RELATION_HEX[rel], 0.22);
        if (rel === "misconception") g.setLineDash([4, 4]); else g.setLineDash([]);
        g.beginPath();
        for (const l of c.links) { if (l.relation !== rel || !visible(l.source) || !visible(l.target)) continue; g.moveTo(l.source.x! - c.cx, l.source.y! - c.cy); g.lineTo(l.target.x! - c.cx, l.target.y! - c.cy); }
        g.stroke();
      }
      g.setLineDash([]);
      for (const n of c.nodes) { if (!visible(n)) continue; g.globalAlpha = n.verified ? 1 : 0.8; g.fillStyle = c.color; g.beginPath(); g.arc(n.x! - c.cx, n.y! - c.cy, rNode(n), 0, 6.2832); g.fill(); }
      g.globalAlpha = 1;
      c.sprite = cvs; c.dim = dim;
    }
    st.dirty = true;
  }

  // ── biến đổi toạ độ có kèm XOAY (rot) ──
  function w2s(wx: number, wy: number) { const v = S.current.view, { W, H } = S.current.size; const c = Math.cos(v.rot), s = Math.sin(v.rot); return { x: W / 2 + v.x + (wx * c - wy * s) * v.k, y: H / 2 + v.y + (wx * s + wy * c) * v.k }; }
  function s2w(sx: number, sy: number) { const v = S.current.view, { W, H } = S.current.size; const dx = (sx - W / 2 - v.x) / v.k, dy = (sy - H / 2 - v.y) / v.k; const c = Math.cos(v.rot), s = Math.sin(v.rot); return { x: dx * c + dy * s, y: -dx * s + dy * c }; }
  // điểm điều khiển của cung cong (bezier bậc 2) — cong lệch theo seed; cộng trôi dx/dy để cạnh BÁM node đang "sống"
  function ctrl(l: SimLink) { const sx = l.source.x! + (l.source.dx || 0), sy = l.source.y! + (l.source.dy || 0), tx = l.target.x! + (l.target.dx || 0), ty = l.target.y! + (l.target.dy || 0); const mx = (sx + tx) / 2, my = (sy + ty) / 2; const dx = tx - sx, dy = ty - sy; const len = Math.hypot(dx, dy) || 1; const nx = -dy / len, ny = dx / len; const bend = len * 0.17 * (l.seed - 0.5) * 2; return { sx, sy, tx, ty, cx: mx + nx * bend, cy: my + ny * bend, len }; }
  function qpt(g: { sx: number; sy: number; cx: number; cy: number; tx: number; ty: number }, t: number) { const u = 1 - t; return { x: u * u * g.sx + 2 * u * t * g.cx + t * t * g.tx, y: u * u * g.sy + 2 * u * t * g.cy + t * t * g.ty }; }

  function drawFrame(now: number) {
    const st = S.current, cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const detail = st.detail;                               // chi tiết: có glow + hạt chạy + nhãn; toàn cảnh thì bỏ cho nhẹ
    const bigDraw = !detail;
    if (!st.fitted && !st.live && st.sim && st.sim.alpha() < 0.16) { st.fitted = true; fitView(); }
    if (st.target) {
      const t = st.target, sp = 0.15; const v = st.view;
      v.x += (t.x - v.x) * sp; v.y += (t.y - v.y) * sp; v.k += (t.k - v.k) * sp; v.rot += (t.rot - v.rot) * sp;
      if (Math.abs(t.x - v.x) < 0.6 && Math.abs(t.y - v.y) < 0.6 && Math.abs(t.rot - v.rot) < 0.002) { v.x = t.x; v.y = t.y; v.k = t.k; v.rot = t.rot; st.target = null; }
    }
    const { W, H, dpr } = st.size, v = st.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + v.x, H / 2 + v.y); ctx.rotate(v.rot); ctx.scale(v.k, v.k);
    // fade: CHỈ khi bấm CHỌN node mới làm mờ nền (mờ dần, không giật); rê chuột chỉ phồng node dưới con trỏ
    st.focusT += ((st.selId ? 1 : 0) - st.focusT) * 0.14;
    st.hoverT += ((st.hoverId ? 1 : 0) - st.hoverT) * 0.22;
    const near = st.near, ft = st.focusT;                    // near = hàng xóm của node ĐANG CHỌN

    // ── "TẾ BÀO SỐNG" — CHỈ ở các chế độ vốn đã vẽ liên tục (detail ≤900 & ngân hà);
    //    band 900–1200 giữ tĩnh như cũ để không đốt 60fps cho chuyển động dưới-pixel. ──
    // 1) chế độ chi tiết: mỗi nguyên tử TRÔI riêng (sóng sin tất định; h1/h2 cache sẵn lúc nạp — không hash/alloc mỗi frame)
    if (!st.clusters.length && st.detail) {
      const tA = now * 0.001;
      for (const n of st.nodes) {
        if (st.drag?.node === n) { n.dx = 0; n.dy = 0; continue; }   // đang kéo thì đứng yên dưới con trỏ
        const h1 = n.h1!, h2 = n.h2!;
        n.dx = Math.sin(tA * (0.4 + h1 * 0.6) + h1 * 6.283) * 2.4;
        n.dy = Math.cos(tA * (0.35 + h2 * 0.6) + h2 * 6.283) * 2.2;
      }
    }
    // 2) gieo NHỊP ĐẬP ambient: thi thoảng một nguyên tử "phập" giãn ra rồi thu lại
    if ((st.clusters.length > 0 || st.detail) && !st.selId && now - st.lastPulse > 420 + Math.random() * 900 && st.pulses.length < (st.clusters.length ? 14 : 7)) {
      st.lastPulse = now;
      if (st.clusters.length) {
        const cs = st.clusters.filter((c) => c.visCount > 0);
        const c = cs.length ? cs[(Math.random() * cs.length) | 0] : null;
        const cand = c ? c.nodes[(Math.random() * c.nodes.length) | 0] : null;
        if (cand && visible(cand)) st.pulses.push({ n: cand, ci: cand.ci ?? null, t0: now });
      } else if (st.nodes.length) {
        for (let t = 0; t < 4; t++) { const cand = st.nodes[(Math.random() * st.nodes.length) | 0]; if (visible(cand)) { st.pulses.push({ n: cand, ci: null, t0: now }); break; } }
      }
    }
    // 3) vẽ nhịp đập: vòng lan tỏa + lõi phồng theo sin — gọi ở CẢ hai nhánh, ngay trước restore
    const drawPulses = () => {
      const dim2 = 1 - 0.75 * ft;                            // đang chọn node thì nhịp nền dịu hẳn
      for (let i = st.pulses.length - 1; i >= 0; i--) {
        const p = st.pulses[i];
        const age = (now - p.t0) / 1150;
        if (age >= 1) { st.pulses.splice(i, 1); continue; }
        if (age < 0 || !visible(p.n)) continue;               // t0 tương lai = nhịp lan truyền đang chờ
        const c0 = p.n.ci != null ? st.clusters[p.n.ci] : undefined;
        const x = p.n.x! + (c0 ? c0.ox : p.n.dx || 0), y = p.n.y! + (c0 ? c0.oy : p.n.dy || 0);
        const col = st.clusters.length || st.colorMode === "subject" ? subjHex(p.n) : CH[p.n.ch % CH.length];
        const s = Math.sin(age * Math.PI);
        ctx.globalAlpha = (1 - age) * 0.5 * dim2;
        ctx.strokeStyle = col; ctx.lineWidth = 1.7 / v.k;
        ctx.beginPath(); ctx.arc(x, y, rNode(p.n) * (1 + age * 3.4), 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 0.6 * s * dim2;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, rNode(p.n) * (1 + 0.55 * s), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // ── NGÂN HÀ toàn cảnh: sprite cụm trôi + dây giả + xung + chớp sáng ──
    if (st.clusters.length) {
      const dt = st.lastNow ? Math.min(0.05, (now - st.lastNow) / 1000) : 0; st.lastNow = now;
      if (!st.selId && !st.selEdgeId) st.driftT += dt;       // đang chọn thì đứng yên cho ổn định
      const tS = st.driftT;
      for (const c of st.clusters) {
        c.ox = c.amp1 * Math.sin(tS * c.w1 + c.p1) + c.amp2 * Math.sin(tS * c.w2 + c.p2);
        c.oy = c.amp1 * Math.cos(tS * c.w3 + c.p3) + c.amp2 * Math.sin(tS * c.w4 + c.p4);
      }
      const dimAll = 1 - 0.72 * ft;
      // dây GIẢ liên cụm (trang trí — chưa có dữ liệu liên môn thật) + xung "giao tiếp" chạy dọc dây
      ctx.lineCap = "round";
      for (const gl of st.ghost) {
        const A = st.clusters[gl.a], Bc = st.clusters[gl.b];
        if (!A.visCount || !Bc.visCount) continue;            // cụm bị lọc trống → không nối dây vào
        const ax = A.cx + A.ox, ay = A.cy + A.oy, bx = Bc.cx + Bc.ox, by = Bc.cy + Bc.oy;
        const mx = (ax + bx) / 2 + (gl.s1 - 0.5) * 240, my = (ay + by) / 2 + (gl.s2 - 0.5) * 240;
        ctx.strokeStyle = hexA("#4E8B6A", (0.055 + 0.045 * Math.sin(tS * 0.7 + gl.s1 * 9)) * dimAll);
        ctx.lineWidth = 1.1 / v.k;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
        if (gl.pulse && !st.selId) {
          const p = qpt({ sx: ax, sy: ay, cx: mx, cy: my, tx: bx, ty: by }, (tS * 0.055 + gl.s2) % 1);
          ctx.globalAlpha = 0.5; ctx.fillStyle = "#6FA88A";
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 / Math.max(0.5, v.k), 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      // cụm sao (sprite) — thở sáng/tối + GIÃN-THU nhẹ như màng tế bào
      for (const c of st.clusters) {
        if (!c.sprite) continue;
        const breathe = 0.9 + 0.1 * Math.sin(tS * c.bw + c.bp);
        const sc = 1 + 0.013 * Math.sin(tS * c.bw * 1.35 + c.bp * 1.7);
        const dw = c.dim * sc;
        ctx.globalAlpha = dimAll * breathe;
        ctx.drawImage(c.sprite, c.cx + c.ox - dw / 2, c.cy + c.oy - dw / 2, dw, dw);
      }
      ctx.globalAlpha = 1;
      // chớp sáng từng vì sao
      if (!st.selId) for (const tw of st.twinkles) {
        if (!visible(tw.n)) continue; const c = st.clusters[tw.ci];
        ctx.globalAlpha = 0.06 + 0.2 * (1 + Math.sin(tS * tw.sp + tw.ph)) / 2;
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(tw.n.x! + c.ox, tw.n.y! + c.oy, rNode(tw.n) * 2.6, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // nhãn cụm lớn
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      for (const c of st.clusters) if (c.count >= 280 && c.visCount) { ctx.fillStyle = hexA(c.color, 0.15 + 0.6 * dimAll); ctx.fillText(c.label, c.cx + c.ox, c.cy + c.oy - c.maxR - 10); }
      // node ĐANG CHỌN/RÊ + hàng xóm: vẽ nét đầy đủ đè lên (cùng cụm → dịch chung 1 offset)
      const focusIds: string[] = [];
      if (st.selId && st.near) focusIds.push(...st.near); else if (st.hoverId) focusIds.push(st.hoverId);
      if (focusIds.length) {
        // Mỗi node dùng offset trôi của CHÍNH CỤM NÓ (khớp pick/nhãn/nhịp) — hàng xóm khác cụm hết bị vẽ lệch
        const fset = new Set(focusIds);
        if (st.selId) for (const l of st.links) {
          if (!fset.has(l.source.id) || !fset.has(l.target.id)) continue;
          const g = ctrl(l);
          const so = nOff(l.source), to = nOff(l.target);
          ctx.strokeStyle = hexA(RELATION_HEX[l.relation], 0.85); ctx.lineWidth = (0.8 + l.weight * 1.7) / v.k;
          if (l.relation === "misconception") ctx.setLineDash([4 / v.k, 4 / v.k]); else ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(g.sx + so.x, g.sy + so.y);
          ctx.quadraticCurveTo(g.cx + (so.x + to.x) / 2, g.cy + (so.y + to.y) / 2, g.tx + to.x, g.ty + to.y); ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const id of focusIds) {
          const n = st.byId.get(id); if (!n || !visible(n)) continue;
          const o = nOff(n);
          const nx2 = n.x! + o.x, ny2 = n.y! + o.y;
          const hot2 = id === st.selId || id === st.hoverId;
          const rr = rNode(n) * (hot2 ? 1.3 : 1);
          ctx.globalAlpha = hot2 ? 0.22 : 0.12; ctx.fillStyle = subjHex(n);
          ctx.beginPath(); ctx.arc(nx2, ny2, rr * 2, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(nx2, ny2, rr, 0, 6.2832);
          if (n.verified) { ctx.fillStyle = subjHex(n); ctx.fill(); } else { ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2 / v.k; ctx.strokeStyle = subjHex(n); ctx.stroke(); }
          if (hot2) { ctx.beginPath(); ctx.arc(nx2, ny2, rr + 3.5 / v.k, 0, 6.2832); ctx.lineWidth = 2.2 / v.k; ctx.strokeStyle = subjHex(n); ctx.stroke(); }
        }
      }
      drawPulses();                                          // nhịp đập tế bào — vẽ đè lên sprite
      ctx.restore();
      drawOverlay(ctx, st);
      return;
    }

    // ── cạnh (đường CONG) + dòng chảy ──
    ctx.lineCap = "round";
    if (bigDraw && !st.selId && !st.selEdgeId && !st.hoverEdgeId && st.focusT < 0.02) {
      // Toàn cảnh không chọn gì: gộp cạnh thành 3 path THẲNG (3 lần stroke thay vì ~4.000) → kéo/zoom mượt
      ctx.lineWidth = 0.7 / v.k;
      for (const rel of ["prerequisite_hard", "related_soft", "misconception"] as EdgeRelation[]) {
        ctx.strokeStyle = hexA(RELATION_HEX[rel], 0.3);
        if (rel === "misconception") ctx.setLineDash([4 / v.k, 4 / v.k]); else ctx.setLineDash([]);
        ctx.beginPath();
        for (const l of st.links) { if (l.relation !== rel || !visible(l.source) || !visible(l.target)) continue; ctx.moveTo(l.source.x! + (l.source.dx || 0), l.source.y! + (l.source.dy || 0)); ctx.lineTo(l.target.x! + (l.target.dx || 0), l.target.y! + (l.target.dy || 0)); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else
    for (const l of st.links) {
      if (!visible(l.source) || !visible(l.target)) continue;
      const isSelE = l.e.id === st.selEdgeId || l.e.id === st.hoverEdgeId;
      const connected = !st.selId || (near ? (near.has(l.source.id) && near.has(l.target.id)) : true);
      const a = isSelE ? 0.95 : connected ? 0.42 : (0.42 * (1 - ft) + 0.05 * ft);   // ngoài vùng chọn: mờ DẦN
      const g = ctrl(l);
      ctx.strokeStyle = hexA(RELATION_HEX[l.relation], a);
      ctx.lineWidth = ((isSelE ? 2.4 : 0.5) + l.weight * 1.7) / v.k;
      if (l.relation === "misconception") ctx.setLineDash([4 / v.k, 4 / v.k]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.quadraticCurveTo(g.cx, g.cy, g.tx, g.ty); ctx.stroke();
      ctx.setLineDash([]);
      if ((l.relation === "prerequisite_hard" && !bigDraw) || isSelE) {
        const t = (now * 0.00011 + l.seed) % 1; const p = qpt(g, t);
        ctx.globalAlpha = isSelE ? 1 : connected ? 0.9 : (0.9 * (1 - ft) + 0.08 * ft); ctx.fillStyle = RELATION_HEX[l.relation];
        ctx.beginPath(); ctx.arc(p.x, p.y, (isSelE ? 3 : 2) / v.k, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      }
    }

    // ── hạt (glow + core) — cùng phong cách cho cả drill và edges mode ──
    for (const n of st.nodes) {
      if (!visible(n)) continue;
      const r = rNode(n);
      const nx = n.x! + (n.dx || 0), ny = n.y! + (n.dy || 0);   // vị trí "sống" = gốc + trôi
      const col = st.colorMode === "subject" ? subjHex(n) : CH[n.ch % CH.length];
      const ext = n.inScope === false;
      const isSel = n.id === st.selId, isHov = n.id === st.hoverId, hot = isSel || isHov;
      const neighbor = !st.selId || (near ? near.has(n.id) : true);
      let dim = neighbor ? 1 : (1 - 0.78 * ft);
      if (ext) dim *= 0.5;
      const grow = isHov ? 1 + 0.32 * st.hoverT : isSel ? 1.22 : 1;
      const rr = r * grow * (ext ? 0.62 : 1);
      if (bigDraw && !hot) {
        // toàn cảnh: 1 lệnh fill / hạt (bỏ glow + viền trắng) → vẽ 12k hạt nhanh, kéo/zoom mượt
        ctx.globalAlpha = dim * (n.verified ? 0.92 : 0.55);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(nx, ny, rr, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1; continue;
      }
      // glow (bỏ ở chế độ toàn cảnh trừ hạt đang chọn/rê)
      if (!bigDraw || hot) { ctx.globalAlpha = dim * (hot ? 0.2 : 0.1);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(nx, ny, rr * (hot ? 2.0 : 1.7), 0, 6.2832); ctx.fill(); }
      // core
      ctx.globalAlpha = dim;
      ctx.beginPath(); ctx.arc(nx, ny, rr, 0, 6.2832);
      if (n.verified && !ext) { ctx.fillStyle = col; ctx.fill(); } else { ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = (ext ? 1.5 : 2) / v.k; ctx.strokeStyle = col; ctx.stroke(); }
      // ring on hover/select
      if (hot) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(nx, ny, rr + 3.5 / v.k, 0, 6.2832); ctx.lineWidth = 2.2 / v.k; ctx.strokeStyle = col; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    drawPulses();                                            // nhịp đập tế bào — trên cùng
    ctx.restore();
    drawOverlay(ctx, st);
  }

  // lớp overlay toạ độ MÀN HÌNH: nhãn có khung + trọng số cạnh
  function drawOverlay(ctx: CanvasRenderingContext2D, st: typeof S.current) {
    const { W, H } = st.size, v = st.view;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const ids: string[] = [];
    if (st.hoverId) ids.push(st.hoverId);
    if (st.selId) { if (!ids.includes(st.selId)) ids.push(st.selId); if (st.near) for (const id of st.near) if (!ids.includes(id)) ids.push(id); }
    else if (v.k > 1.2 && st.detail) for (const n of st.nodes) if (visible(n) && !ids.includes(n.id)) ids.push(n.id);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const hit = (b: { x: number; y: number; w: number; h: number }) => placed.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    const FS = 11, LH = 14, PAD = 5, MAXW = 150;
    ctx.font = `${FS}px ui-sans-serif, system-ui, sans-serif`;
    for (const id of ids) {
      const n = st.byId.get(id); if (!n) continue;
      const o = nOff(n);
      const sp = w2s(n.x! + o.x, n.y! + o.y); const nx = sp.x, ny = sp.y; if (nx < -90 || nx > W + 90 || ny < -40 || ny > H + 40) continue;
      const lines = wrapLabel(ctx, readableMath(n.title), MAXW);
      let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
      const bw = tw + PAD * 2, bh = lines.length * LH + PAD * 2, r = rNode(n) * v.k;
      const bx = nx + r + 6, by = ny - bh / 2, box = { x: bx, y: by, w: bw, h: bh };
      const focus = id === st.selId || id === st.hoverId;
      if (!focus && hit(box)) continue;
      placed.push(box);
      rrect(ctx, bx, by, bw, bh, 7); ctx.fillStyle = focus ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.9)"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = focus ? "rgba(40,60,45,0.5)" : "rgba(40,60,45,0.16)"; ctx.stroke();
      ctx.fillStyle = "#26332b";
      lines.forEach((l, i) => ctx.fillText(l, bx + PAD, by + PAD + LH / 2 + i * LH));
    }
    // trọng số cạnh: khi zoom to (mọi cạnh đang sáng) hoặc cạnh đang chọn/hover
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif"; ctx.textAlign = "center";
    for (const l of st.links) {
      if (st.clusters.length) break;                          // chế độ ngân hà: không hiện trọng số cạnh
      const isSelE = l.e.id === st.selEdgeId || l.e.id === st.hoverEdgeId;
      const on = isSelE || (v.k > 1.55 && (!st.selId || (!!st.near && st.near.has(l.source.id) && st.near.has(l.target.id))));
      if (!on) continue;
      const g = ctrl(l); const mid = qpt(g, 0.5); const sp = w2s(mid.x, mid.y);
      if (sp.x < 4 || sp.x > W - 4 || sp.y < 4 || sp.y > H - 4) continue;
      const w = String(l.weight), tw = ctx.measureText(w).width;
      rrect(ctx, sp.x - tw / 2 - 4, sp.y - 8, tw + 8, 16, 5); ctx.fillStyle = isSelE ? RELATION_HEX[l.relation] : "rgba(255,255,255,0.96)"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(40,60,45,0.2)"; ctx.stroke();
      ctx.fillStyle = isSelE ? "#fff" : RELATION_HEX[l.relation]; ctx.fillText(w, sp.x, sp.y);
    }
    ctx.textAlign = "left";
  }

  function fitView() {
    const st = S.current; if (!st.nodes.length) return;
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9, any = false;
    for (const n of st.nodes) { if (!visible(n)) continue; any = true; a = Math.min(a, n.x!); b = Math.min(b, n.y!); c = Math.max(c, n.x!); d = Math.max(d, n.y!); }
    if (!any) for (const n of st.nodes) { a = Math.min(a, n.x!); b = Math.min(b, n.y!); c = Math.max(c, n.x!); d = Math.max(d, n.y!); }
    const gw = c - a || 1, gh = d - b || 1, { W, H } = st.size;
    const k = Math.max(0.2, Math.min(2, 0.84 * Math.min(W / gw, H / gh)));
    st.view = { k, x: -((a + c) / 2) * k, y: -((b + d) / 2) * k, rot: 0 };
    st.target = null; st.dirty = true;
  }

  useEffect(() => {
    const st = S.current; st.deg = deg;
    const N: GNode[] = raw.map((n) => ({ ...n, h1: hash(n.id), h2: hash(n.id + "~d") })); // seed trôi cache 1 lần (tiền lệ: seed của cạnh)
    const byId = new Map(N.map((n) => [n.id, n]));
    const L: SimLink[] = rawEdges.filter((e) => byId.has(e.from) && byId.has(e.to)).map((e) => ({ source: byId.get(e.from)!, target: byId.get(e.to)!, relation: e.relation, weight: e.weight, e, seed: hash(e.id) }));
    const linkById = new Map(L.map((l) => [l.e.id, l]));
    // Chế độ LỚN (toàn cảnh / cả môn): KHÔNG chạy lực — vị trí TẤT ĐỊNH (0ms, mở tức thì):
    // cụm Môn×Lớp neo theo xoáy phyllotaxis (góc vàng), nguyên tử rải Gauss quanh neo theo hash.
    const big = N.length > 1200;
    let sim: Simulation<GNode, undefined>;
    if (big) {
      const key = (n: GNode) => (n.subjectId || "") + "|" + (n.grade ?? "");
      const counts = new Map<string, number>(), vers = new Map<string, number>();
      for (const n of N) { counts.set(key(n), (counts.get(key(n)) || 0) + 1); if (n.verified) vers.set(key(n), (vers.get(key(n)) || 0) + 1); }
      const keys = [...counts.keys()]; const maxC = Math.max(1, ...counts.values());
      // Cụm xích LẠI GẦN nhau (spread nhỏ) — trôi nhẹ nên thi thoảng chạm rìa nhau như "giao tiếp".
      const GA = Math.PI * (3 - Math.sqrt(5)), spread = 250;
      const pos = new Map<string, { x: number; y: number }>();
      keys.forEach((k, i) => { const a = i * GA + (hash(k + "~") - 0.5) * 0.55, rr = spread * Math.sqrt(i + 0.5) + (hash(k) - 0.5) * 110; pos.set(k, { x: Math.cos(a) * rr, y: Math.sin(a) * rr }); });
      // vỏ cụm + tham số trôi/thở riêng từng cụm (tất định theo hash)
      const cls: typeof st.clusters = keys.map((k) => { const p = pos.get(k)!; const R = (o: number) => hash(k + "#" + o); return {
        key: k, label: "", color: "#3F7A2E", cx: p.x, cy: p.y, maxR: 0, count: counts.get(k) || 0, ver: vers.get(k) || 0, visCount: 0, sprite: null, dim: 0,
        amp1: 9 + 10 * R(1), amp2: 4 + 6 * R(2), w1: 0.10 + 0.12 * R(3), w2: 0.07 + 0.10 * R(4), w3: 0.09 + 0.12 * R(5), w4: 0.06 + 0.09 * R(6),
        p1: R(7) * 6.28, p2: R(8) * 6.28, p3: R(9) * 6.28, p4: R(10) * 6.28, bw: 0.35 + 0.5 * R(11), bp: R(12) * 6.28, ox: 0, oy: 0, nodes: [], links: [],
      }; });
      const idxOf = new Map(keys.map((k, i) => [k, i] as const));
      for (const n of N) {
        const k = key(n), ci = idxOf.get(k)!, c = cls[ci];
        // TO theo số lượng + PHỒNG thêm theo tỷ lệ đã thẩm định
        const vr = c.count ? c.ver / c.count : 0;
        const sigma = (30 + 150 * Math.sqrt(c.count / maxC)) * (0.85 + 0.45 * vr);
        let s = (Math.floor(hash(n.id) * 4294967296) ^ 0x9e3779b9) >>> 0;
        const nx = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        nx();
        const u1 = Math.max(1e-6, nx()), u2 = nx();
        const r = Math.min(Math.sqrt(-2 * Math.log(u1)) * 0.5 * sigma, 1.5 * sigma), th = 6.2832 * u2;
        n.x = c.cx + Math.cos(th) * r; n.y = c.cy + Math.sin(th) * r;
        n.ci = ci; c.nodes.push(n); if (r > c.maxR) c.maxR = r;
        if (!c.label) { c.label = `${n.subject || ""} ${n.grade ?? ""}`.trim(); c.color = subjHex(n); }
      }
      for (const l of L) { const ci = l.source.ci; if (ci != null) cls[ci].links.push(l); }
      // DÂY GIẢ liên cụm (trang trí, chưa có dữ liệu liên môn thật): 1-2 cụm gần nhất + chuỗi lớp cùng môn
      const ghost: typeof st.ghost = []; const seenG = new Set<string>();
      const addG = (a: number, b: number) => { if (a === b) return; const kk = a < b ? a + "-" + b : b + "-" + a; if (seenG.has(kk)) return; seenG.add(kk); ghost.push({ a, b, s1: hash(kk), s2: hash(kk + "x"), pulse: hash(kk + "p") < 0.45 }); };
      cls.forEach((c, i) => { const ds = cls.map((d, j) => ({ j, dd: (d.cx - c.cx) ** 2 + (d.cy - c.cy) ** 2 })).filter((x) => x.j !== i).sort((x, y) => x.dd - y.dd); if (ds[0]) addG(i, ds[0].j); if (ds[1] && hash(c.key + "n2") < 0.6) addG(i, ds[1].j); });
      const bySub = new Map<string, { g: number; i: number }[]>();
      cls.forEach((c, i) => { const [sid, g] = c.key.split("|"); const arr = bySub.get(sid) || []; arr.push({ g: +g, i }); bySub.set(sid, arr); });
      bySub.forEach((arr) => { arr.sort((x, y) => x.g - y.g); for (let i = 1; i < arr.length; i++) addG(arr[i - 1].i, arr[i].i); });
      // sao chớp: chọn rải rác vài hạt mỗi cụm
      const tws: typeof st.twinkles = [];
      cls.forEach((c, ci) => { const step = Math.max(8, Math.floor(c.nodes.length / 6) || 8); for (let i = 0; i < c.nodes.length; i += step) { const n = c.nodes[i]; tws.push({ n, ci, ph: hash(n.id + "t") * 6.28, sp: 0.7 + 1.6 * hash(n.id + "s") }); } });
      st.clusters = cls; st.ghost = ghost; st.twinkles = tws; st.driftT = 0; st.lastNow = 0;
      sim = forceSimulation<GNode>(N); sim.stop(); sim.alpha(0);
      st.live = false;
    } else {
      st.clusters = []; st.ghost = []; st.twinkles = [];
      // Đồ thị nhỏ: lắng động CÓ HOẠT CẢNH — vài tick đầu đồng bộ, phần còn lại tick theo ngân sách 8ms/khung.
      sim = forceSimulation<GNode>(N)
        .force("link", forceLink<GNode, SimLink>(L).id((n) => n.id).distance((l) => (l.relation === "related_soft" ? 104 : 66)).strength((l) => 0.12 + l.weight * 0.5))
        .force("charge", forceManyBody<GNode>().strength(-190).distanceMax(520))
        .force("collide", forceCollide<GNode>().radius((n) => rNode(n as GNode) + 6))
        .force("x", forceX(0).strength(0.04)).force("y", forceY(0).strength(0.04))
        .alpha(1).alphaDecay(0.028).velocityDecay(0.36);
      sim.stop(); for (let i = 0; i < 30; i++) sim.tick();
      st.live = true;
    }
    st.dirty = true;
    st.nodes = N; st.links = L; st.byId = byId; st.linkById = linkById; st.sim = sim;
    st.selId = null; st.near = null; st.hoverId = null; st.hoverNear = null; st.selEdgeId = null; st.hoverEdgeId = null; st.fitted = false;
    st.pulses = []; st.lastPulse = 0;
    if (big) bakeClusters();
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, rawEdges]);

  // vào từ CÂY (bấm nguyên tử) → tự chọn & căn giữa — effect RIÊNG: focusAtom đổi không kéo theo rebuild layout
  useEffect(() => {
    if (!focusAtom) return;
    const fa = focusAtom;
    const t = setTimeout(() => { if (S.current.byId.has(fa)) selectNode(fa); }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAtom, raw]);

  useEffect(() => {
    let raf = 0; const loop = (t: number) => {
      const st = S.current; st.now = t;
      if (st.live && st.sim) {                                    // lắng động theo NGÂN SÁCH thời gian → luôn mượt
        const t0 = performance.now();
        do { st.sim.tick(); } while (st.sim.alpha() > 0.03 && performance.now() - t0 < 8);
        if (st.sim.alpha() <= 0.03) st.live = false;
        if (!st.drag && !st.target) fitView();                    // đừng giành khung với thao tác người dùng
        st.dirty = true;
      }
      const small = st.detail;                               // chế độ chi tiết → vẽ liên tục (có hạt chạy)
      const hot = !!(st.hoverId || st.selId || st.selEdgeId); // đang rê/chọn → vẽ liên tục cho hoạt cảnh mượt
      const galaxy = st.clusters.length > 0;                  // ngân hà trôi + chớp sáng → luôn vẽ (sprite nên rất nhẹ)
      // "tế bào sống" chỉ chạy ở detail & galaxy — hai chế độ này vốn đã vẽ liên tục, không thêm chi phí idle
      if (small || hot || galaxy || st.dirty || st.target || st.drag || st.live) { drawFrame(t); if (!small && !hot && !galaxy && !st.target && !st.drag && !st.live) st.dirty = false; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current; if (!wrap || !cv) return;
    const resize = () => {
      const r = wrap.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      S.current.size = { W: r.width, H: r.height, dpr };
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
      S.current.dirty = true;
    };
    resize(); const ro = new ResizeObserver(resize); ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bộ lọc đổi → cập nhật cờ ẩn/hiện, căn lại khung theo phần đang hiện (KHÔNG dựng lại layout).
  useEffect(() => {
    const st = S.current; st.filter = { subjects: filterSubjects, grades: filterGrades, chapters: filterChapters, verOnly: filterVerOnly }; st.colorMode = colorMode;
    let vc = 0; for (const n of st.nodes) { if (visible(n)) { vc++; if (vc > 900) break; } }
    st.detail = vc <= 900;                                  // ít điểm hiện → chế độ CHI TIẾT (nhãn, hạt chạy, glow)
    if (st.clusters.length) bakeClusters();                 // bộ lọc đổi → nướng lại sprite cụm
    st.fitted = false; st.dirty = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function pick(cx: number, cy: number): GNode | null {
    const st = S.current, w = s2w(cx, cy); let best: GNode | null = null, bd = Infinity;
    for (const n of st.nodes) { if (!visible(n)) continue; const o = nOff(n); const dx = n.x! + o.x - w.x, dy = n.y! + o.y - w.y, dd = dx * dx + dy * dy, r = Math.max(rNode(n) + 5, 11 / st.view.k); if (dd < r * r && dd < bd) { bd = dd; best = n; } }
    return best;
  }
  function pickEdge(cx: number, cy: number): SimLink | null {
    const st = S.current; if (st.clusters.length) return null; // ngân hà: không bắt cạnh (dây quá mảnh, ưu tiên bắt hạt)
    const w = s2w(cx, cy); const thr = Math.max(7, 9 / st.view.k); let best: SimLink | null = null, bd = thr * thr;
    for (const l of st.links) {
      if (!visible(l.source) || !visible(l.target)) continue;
      const g = ctrl(l);
      for (let i = 1; i <= 11; i++) { const p = qpt(g, i / 12); const dx = p.x - w.x, dy = p.y - w.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = l; } }
    }
    return best;
  }
  function tilt(id: string) { return (hash(id) - 0.5) * 0.44; } // xoay nhẹ ±~12°
  function selectNode(id: string | null) {
    const st = S.current; st.selId = id; st.near = id ? neighborsSet(id) : null; st.selEdgeId = null; st.dirty = true;
    // tương tác "tế bào": chạm vào → node đập 1 nhịp, rồi nhịp LAN dần sang hàng xóm
    if (id) {
      const n0 = st.byId.get(id);
      if (n0) {
        const t0 = performance.now();
        st.pulses.push({ n: n0, ci: n0.ci ?? null, t0 });
        let k = 1;
        const seen = new Set<string>([id]); // không đốt slot cho hàng xóm ẩn theo bộ lọc / cạnh song song trùng cặp
        for (const l of st.links) {
          if (k > 6) break;
          const nb = l.source.id === id ? l.target : l.target.id === id ? l.source : null;
          if (nb && !seen.has(nb.id) && visible(nb)) { seen.add(nb.id); st.pulses.push({ n: nb, ci: nb.ci ?? null, t0: t0 + k * 120 }); k++; }
        }
      }
    }
    setSel(id); setSelEdge(null);
    if (id) setTimeout(() => { const n = S.current.byId.get(id); if (n) { const o = nOff(n); const k = S.current.view.k; S.current.target = { k, x: -((n.x || 0) + o.x) * k, y: -((n.y || 0) + o.y) * k, rot: tilt(id) }; } }, 80);
    else S.current.target = { ...S.current.view, rot: 0 };
  }
  function selectEdge(id: string | null) {
    const st = S.current; st.selEdgeId = id; st.selId = null; st.near = null; st.dirty = true;
    setSelEdge(id); setSel(id ? null : null);
    if (id) { const l = st.linkById.get(id); if (l) setTimeout(() => { const g = ctrl(l); const m = qpt(g, 0.5); const k = S.current.view.k; S.current.target = { k, x: -m.x * k, y: -m.y * k, rot: tilt(id) }; }, 80); }
  }

  const rel = (e: React.PointerEvent) => { const r = wrapRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    const st = S.current;
    st.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.ptrs.size >= 2) {                          // hai ngón → CHỤM: huỷ kéo node, ghi khoảng cách gốc
      if (st.drag?.node) { st.drag.node.fx = null; st.drag.node.fy = null; }
      st.drag = null;
      const [a, b] = [...st.ptrs.values()];
      st.pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      return;
    }
    const p = rel(e), n = pick(p.x, p.y); st.target = null;
    st.drag = { node: n, sx: e.clientX, sy: e.clientY, px: st.view.x, py: st.view.y, moved: false };
    if (n) { n.fx = n.x; n.fy = n.y; if (st.nodes.length <= 1200) st.sim?.alphaTarget(0.3).restart(); }
    st.dirty = true;
  };
  const onMove = (e: React.PointerEvent) => {
    const st = S.current;
    if (st.ptrs.has(e.pointerId)) st.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.ptrs.size >= 2 && st.pinch != null) {      // đang chụm 2 ngón → zoom quanh TRUNG ĐIỂM
      const [a, b] = [...st.ptrs.values()];
      const nd = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, nd / st.pinch); st.pinch = nd; return;
    }
    const d = st.drag, p = rel(e);
    if (d) {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 6) d.moved = true;
      if (d.node && !st.clusters.length) { const w = s2w(p.x, p.y); d.node.fx = w.x; d.node.fy = w.y; d.node.x = w.x; d.node.y = w.y; }
      else { st.view.x = d.px + (e.clientX - d.sx); st.view.y = d.py + (e.clientY - d.sy); }  // ngân hà: kéo trên hạt = pan (hạt nằm trong sprite)
      st.dirty = true; return;
    }
    const n = pick(p.x, p.y); const eSel = n ? null : pickEdge(p.x, p.y);
    const id = n?.id || null;
    if (id !== st.hoverId) { st.hoverId = id; st.hoverNear = id ? neighborsSet(id) : null; st.hoverT = 0; setHoverId(id); st.dirty = true; }
    if ((eSel?.e.id || null) !== st.hoverEdgeId) st.dirty = true;
    st.hoverEdgeId = eSel?.e.id || null;
    if (wrapRef.current) wrapRef.current.style.cursor = (n || eSel) ? "pointer" : "grab";
  };
  const onUp = (e?: React.PointerEvent) => {
    const st = S.current;
    if (e) st.ptrs.delete(e.pointerId);
    if (st.ptrs.size < 2) st.pinch = null;            // nhả bớt ngón → thoát chế độ chụm
    const d = st.drag; if (!d) return; st.dirty = true;
    if (d.node) { d.node.fx = null; d.node.fy = null; st.sim?.alphaTarget(0); if (!d.moved) selectNode(d.node.id); }
    else if (!d.moved) {
      // bấm nền: thử trúng cạnh trước, không thì bỏ chọn
      const e = pickEdge(d.sx - (wrapRef.current?.getBoundingClientRect().left || 0), d.sy - (wrapRef.current?.getBoundingClientRect().top || 0));
      if (e) selectEdge(e.e.id); else { selectNode(null); selectEdge(null); }
    }
    st.drag = null;
  };
  // zoom quanh MỘT điểm màn hình (giữ điểm đó đứng yên) — dùng chung cho lăn chuột, chụm touchpad, chụm 2 ngón
  const zoomAt = (clientX: number, clientY: number, f: number) => {
    const st = S.current; if (!wrapRef.current) return; st.target = null;
    const r = wrapRef.current.getBoundingClientRect();
    const cx = clientX - r.left - st.size.W / 2, cy = clientY - r.top - st.size.H / 2;
    const nk = Math.max(0.2, Math.min(4, st.view.k * f));
    const wx = (cx - st.view.x) / st.view.k, wy = (cy - st.view.y) / st.view.k;
    st.view.x = cx - wx * nk; st.view.y = cy - wy * nk; st.view.k = nk; st.dirty = true;
  };
  const zoom = (f: number) => { const st = S.current; st.view.k = Math.max(0.2, Math.min(4, st.view.k * f)); st.dirty = true; };

  // Bộ nghe wheel NON-PASSIVE trên vùng graph. React onWheel bị passive → preventDefault vô hiệu, nên cú
  // CHỤM-TOUCHPAD (trình duyệt gửi dưới dạng Ctrl+lăn) lọt ra phóng CẢ TRANG. Gắn native {passive:false}
  // để chặn ngay tại graph; rời graph thì trang vẫn zoom bình thường (không đụng accessibility).
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      // Ctrl+lăn = chụm touchpad → zoom MƯỢT theo độ lớn deltaY; lăn chuột thường → nấc rời rạc như cũ.
      const f = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.12 : 0.893);
      zoomAt(e.clientX, e.clientY, f);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // đổi node đang chọn → reset ngay trong render (có guard); effect CHỈ lo việc fetch
  const [prevSel, setPrevSel] = useState<string | null>(null);
  if (prevSel !== sel) { setPrevSel(sel); setLvl(0); setDetail(null); setDetailBusy(!!sel); }
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    getData<AtomDetail>("atom", { id: sel }).then((d) => { if (alive) { setDetail(d); setDetailBusy(false); } }).catch(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [sel]);

  const selNode = sel ? S.current.byId.get(sel) : null;
  const selLink = selEdge ? S.current.linkById.get(selEdge) : null;
  // hàng xóm theo quan hệ (cho khối "Liên quan")
  const neighbors = useMemo(() => {
    if (!sel) return [] as { node: GNode; relation: EdgeRelation; dir: "in" | "out" }[];
    const out: { node: GNode; relation: EdgeRelation; dir: "in" | "out" }[] = [];
    for (const l of S.current.links) {
      if (l.source.id === sel) out.push({ node: l.target, relation: l.relation, dir: "out" });
      else if (l.target.id === sel) out.push({ node: l.source, relation: l.relation, dir: "in" });
    }
    return out.sort((a, b) => (S.current.deg[b.node.id] || 0) - (S.current.deg[a.node.id] || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const pkgs = (detail?.packages || []).filter(Boolean) as Pkg[];
  const curPkg = pkgs[Math.min(lvl, Math.max(0, pkgs.length - 1))] || null;

  return (
    <div ref={rootRef} className="relative flex h-full w-full overflow-hidden" style={{ background: "var(--color-canvas)" }}>
      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none" style={{ cursor: "grab" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="block h-full w-full" />

        <div className="absolute bottom-3 left-3 flex flex-col gap-1">
          {[["+", () => zoom(1.25)], ["−", () => zoom(0.8)], ["⤢", () => { S.current.fitted = false; S.current.dirty = true; }]].map(([t, fn], i) => (
            <button key={i} onClick={fn as () => void} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface/90 text-sm text-ink-2 shadow-sm backdrop-blur transition hover:border-brand hover:text-brand">{t as string}</button>
          ))}
        </div>

        {showLegend && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-surface/90 px-3 py-2 text-xs text-ink-2 shadow-sm backdrop-blur">
            <p className="mb-1 font-display text-sm font-semibold text-ink">{rootTitle}</p>
            <p className="text-muted">{S.current.nodes.length} nguyên tử · {S.current.links.length} liên kết</p>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {(["prerequisite_hard", "related_soft", "misconception"] as EdgeRelation[]).map((r) => (
                <span key={r} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: RELATION_HEX[r] }} />{RELATION_LABEL[r]}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative flex shrink-0 flex-col overflow-hidden border-l border-line bg-white/55 shadow-[-8px_0_32px_-16px_rgba(30,50,40,0.2)] backdrop-blur-2xl"
        style={{ width: panelW, maxWidth: "85vw" }}>
        {/* tay kéo ở MÉP TRÁI — di chuột tới cạnh thấy con trỏ ↔; chỉ kéo rộng/hẹp, khung LUÔN hiện */}
        <div onPointerDown={startResize} title="Kéo để chỉnh rộng/hẹp"
          className="group absolute left-0 top-0 z-20 h-full w-2.5 -translate-x-1/2 cursor-col-resize">
          <div className="mx-auto h-full w-0.5 rounded bg-transparent transition group-hover:bg-brand/50" />
        </div>
        {selLink ? (
          <EdgePanel link={selLink} onClose={() => selectEdge(null)} onPick={(id) => selectNode(id)} />
        ) : selNode ? (
          <NodePanel node={selNode} detail={detail} busy={detailBusy} pkgs={pkgs} curPkg={curPkg} lvl={lvl} setLvl={setLvl}
            neighbors={neighbors} onClose={() => selectNode(null)} onPick={(id) => selectNode(id)} onOpenAtom={onOpenAtom} />
        ) : (
          <EmptyPanel />
        )}
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/60 text-2xl text-brand/70 shadow-sm">✦</span>
      <p className="font-display text-sm font-semibold text-ink">Khung thông tin tri thức</p>
      <p className="max-w-[15rem] text-xs leading-relaxed text-muted">Bấm một <b className="text-ink-2">hạt</b> để xem tổng quan · chi tiết · ví dụ của nguyên tử. Bấm vào một <b className="text-ink-2">dây nối</b> để xem mối quan hệ giữa hai nguyên tử.</p>
    </div>
  );
}

const SECTIONS: { key: string; label: string; icon: typeof BookOpen; tone: string }[] = [
  { key: "objective", label: "Tổng quan", icon: Compass, tone: "text-brand" },
  { key: "explanation", label: "Chi tiết", icon: BookOpen, tone: "text-info" },
  { key: "example", label: "Ví dụ", icon: Lightbulb, tone: "text-ok" },
  { key: "commonMistake", label: FIELD_LABEL.commonMistake, icon: AlertTriangle, tone: "text-danger" },
  { key: "strategy", label: FIELD_LABEL.strategy, icon: GraduationCap, tone: "text-brass-ink" },
];

function PanelHead({ crumb, title, onClose, badge }: { crumb: string; title: React.ReactNode; onClose: () => void; badge?: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-black/5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted">{crumb}</p>
        <button onClick={onClose} title="Đóng" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-black/5 hover:text-ink"><X size={14} /></button>
      </div>
      <h3 className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-ink">{title}</h3>
      {badge}
    </div>
  );
}

function NodePanel({ node, detail, busy, pkgs, curPkg, lvl, setLvl, neighbors, onClose, onPick, onOpenAtom }: {
  node: { id: string; title: string; code: string; atomType: AtomType | null; bloom: string | null; dok: number | null; verified: boolean; chTitle: string; lessonTitle?: string; yeuCau?: string | null; nangLuc?: string | null; subjectId?: string };
  detail: AtomDetail | null; busy: boolean; pkgs: Pkg[]; curPkg: Pkg | null; lvl: number; setLvl: (n: number) => void;
  neighbors: { node: { id: string; title: string }; relation: EdgeRelation; dir: "in" | "out" }[];
  onClose: () => void; onPick: (id: string) => void; onOpenAtom: (id: string) => void;
}) {
  const refs = detail?.refs || [];
  const questions = detail?.questions || [];
  return (
    <>
      <PanelHead crumb={`${node.chTitle}${node.lessonTitle ? ` › ${node.lessonTitle}` : ""}`} title={mathNodes(node.title)} onClose={onClose}
        badge={
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="rounded-full bg-black/5 px-2 py-0.5 font-mono text-[10px] text-ink-2">{node.code}</span>
            {node.atomType && <span className={cls("rounded-full px-2 py-0.5 text-[10px] font-medium", ATOM_TYPE_COLOR[node.atomType])}>{ATOM_TYPE_LABEL[node.atomType]}</span>}
            {node.bloom && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-ink-2">{node.bloom}</span>}
            {node.dok != null && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-ink-2">DOK {node.dok}</span>}
            <span className={cls("rounded-full px-2 py-0.5 text-[10px] font-medium", node.verified ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>{node.verified ? "✓ đã thẩm định" : "nháp"}</span>
          </div>
        } />
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5 text-xs leading-relaxed text-ink-2 scrollthin">
        {node.yeuCau && (
          <div className="rounded-xl border border-brand-line/60 bg-brand-bg/50 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand">Yêu cầu cần đạt</p>
            <div>{renderRich(node.yeuCau)}</div>
          </div>
        )}
        {detail?.atom.quanNiemSai && (
          <div className="rounded-xl border border-warn-line bg-warn-bg/50 px-3 py-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-warn"><AlertTriangle size={12} strokeWidth={2} />Quan niệm sai</p>
            <div>{renderRich(detail.atom.quanNiemSai)}</div>
          </div>
        )}
        {node.nangLuc && (
          <p className="text-[11px] text-muted"><span className="font-semibold text-ink-2">Năng lực:</span> {mathNodes(node.nangLuc)}</p>
        )}

        {/* nội dung gói (tổng quan / chi tiết / ví dụ …) */}
        {busy ? (
          <p className="text-muted">Đang tải nội dung…</p>
        ) : pkgs.length === 0 ? (
          <button onClick={() => onOpenAtom(node.id)}
            className="block w-full rounded-xl border border-dashed border-line-strong bg-white/40 px-3 py-4 text-center text-[11px] text-muted transition hover:border-brand hover:bg-brand-bg/40 hover:text-brand-ink">
            Chưa có gói nội dung cho nguyên tử này.<br />Mở <b className="text-ink-2">trang nguyên tử</b> để nháp gói và sinh học liệu →
          </button>
        ) : (
          <>
            {pkgs.length > 1 && (
              <div className="flex items-center gap-1">
                {pkgs.map((p, i) => (
                  <button key={p.id} onClick={() => setLvl(i)} className={cls("rounded-full px-2.5 py-1 text-[10px] font-medium transition", i === lvl ? "bg-ink text-white" : "bg-black/5 text-ink-2 hover:bg-black/10")}>
                    Mức {p.level} · {LEVEL_LABEL[p.level]}
                  </button>
                ))}
              </div>
            )}
            {curPkg && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className={cls("rounded-full px-2 py-0.5 text-[10px] font-medium", PKG_STATUS_COLOR[curPkg.status])}>{STATUS_LABEL[curPkg.status]}</span>
                </div>
                {SECTIONS.map((s) => {
                  const val = curPkg.fields[s.key]; if (!val || !val.trim()) return null; const Icon = s.icon;
                  return (
                    <div key={s.key}>
                      <p className={cls("mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide", s.tone)}><Icon size={12} strokeWidth={2} />{s.label}</p>
                      <div className="rounded-lg bg-white/45 px-3 py-2">{renderRich(val)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* liên quan (hàng xóm đồ thị) */}
        {neighbors.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"><Link2 size={12} strokeWidth={2} />Liên quan ({neighbors.length})</p>
            <div className="space-y-1">
              {neighbors.slice(0, 12).map((nb, i) => (
                <button key={i} onClick={() => onPick(nb.node.id)} className="flex w-full items-center gap-2 rounded-lg border border-black/5 bg-white/50 px-2.5 py-1.5 text-left transition hover:bg-white/90">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RELATION_HEX[nb.relation] }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{mathNodes(nb.node.title)}</span>
                  <span className={cls("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium", RELATION_COLOR[nb.relation])}>{nb.dir === "in" ? "← " : "→ "}{RELATION_LABEL[nb.relation]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ngân hàng câu hỏi gắn thẳng vào nguyên tử (kho sản xuất kèm phân rã) */}
        {questions.length > 0 && <QuestionList questions={questions} />}

        {/* tài liệu */}
        {refs.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"><Layers size={12} strokeWidth={2} />Tài liệu ({refs.length})</p>
            <div className="space-y-1">
              {refs.slice(0, 8).map((r) => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-black/5 bg-white/50 px-2.5 py-1.5 transition hover:bg-white/90">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{r.title}</span>
                  <ArrowUpRight size={12} className="shrink-0 text-muted" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* MỘT lối đi: vào trang nguyên tử. Trước đây cạnh nút này còn nút "⚙ Sản xuất" bắn thẳng sang
          Xưởng — hai nút ngang hàng, không rõ bấm cái nào, và Xưởng thì không biết mình đến từ đâu.
          Sản xuất (đơn lẻ lẫn hàng loạt) nay đều xuất phát từ trang nguyên tử. */}
      <div className="shrink-0 border-t border-black/5 px-4 py-2.5">
        <button onClick={() => onOpenAtom(node.id)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white transition hover:opacity-90">
          Mở nguyên tử <ArrowUpRight size={14} />
        </button>
      </div>
    </>
  );
}

// Ngân hàng câu hỏi của một nguyên tử: gập lại theo mặc định, mở từng câu để xem đáp án + phương án nhiễu.
// Mỗi nhiễu kèm LÝ DO SAI — đây là chỗ quan niệm sai của học sinh nằm ở cấp câu hỏi.
function QuestionList({ questions }: { questions: Question[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? questions : questions.slice(0, 5);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <ListChecks size={12} strokeWidth={2} />Câu hỏi ({questions.length})
      </p>
      <div className="space-y-1">
        {shown.map((q) => {
          const isOpen = open === q.id;
          return (
            <div key={q.id} className="overflow-hidden rounded-lg border border-black/5 bg-white/50">
              <button onClick={() => setOpen(isOpen ? null : q.id)} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition hover:bg-white/90">
                <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink">{isOpen ? renderRich(q.noiDung) : <span className="line-clamp-2">{mathNodes(q.noiDung)}</span>}</span>
                {q.doKho && <span className="mt-0.5 shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] text-ink-2">{q.doKho}</span>}
                {q.dok != null && <span className="mt-0.5 shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] text-ink-2">DOK {q.dok}</span>}
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-black/5 px-2.5 py-2">
                  {q.dapAn && (
                    <p className="flex items-start gap-1.5 text-[11px] text-ok">
                      <Check size={12} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1 text-ink">{renderRich(q.dapAn)}</span>
                    </p>
                  )}
                  {(q.nhieu || []).map((n, i) => (
                    <div key={i} className="rounded-md bg-black/[0.03] px-2 py-1.5">
                      <p className="text-[11px] text-ink-2">{renderRich(n.noiDung)}</p>
                      {n.lyDo && <p className="mt-0.5 text-[10px] text-warn">{mathNodes(n.lyDo)}</p>}
                    </div>
                  ))}
                  {q.loiGiai && (
                    <div className="rounded-md bg-brand-bg/40 px-2 py-1.5">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Lời giải</p>
                      <div className="text-[11px]">{renderRich(q.loiGiai)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {questions.length > 5 && (
        <button onClick={() => setShowAll(!showAll)} className="mt-1 text-[10px] font-medium text-brand transition hover:underline">
          {showAll ? "Thu gọn" : `Xem tất cả ${questions.length} câu`}
        </button>
      )}
    </div>
  );
}

function EdgePanel({ link, onClose, onPick }: { link: SimLink; onClose: () => void; onPick: (id: string) => void }) {
  const e = link.e, rel = link.relation;
  const dirLabel = rel === "prerequisite_hard" ? "phải nắm trước khi học" : rel === "misconception" ? "dễ nhầm lẫn với" : "bổ trợ cho";
  return (
    <>
      <PanelHead crumb="Mối quan hệ tri thức" title={<span className={cls("inline-flex items-center gap-1.5")}><span className="h-2.5 w-2.5 rounded-full" style={{ background: RELATION_HEX[rel] }} />{RELATION_LABEL[rel]}</span>} onClose={onClose}
        badge={<div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted"><span>Trọng số <b className="text-ink">{e.weight}</b></span>{e.tanSuat && <span>· Tần suất <b className="text-ink-2">{e.tanSuat}</b></span>}{e.bloomGap != null && <span>· ΔBloom {e.bloomGap}</span>}</div>} />
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5 text-xs leading-relaxed text-ink-2 scrollthin">
        {/* hai đầu quan hệ */}
        <div className="space-y-1.5">
          <button onClick={() => onPick(link.source.id)} className="flex w-full items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 text-left transition hover:bg-white/90">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: RELATION_HEX[rel] }}>A</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{mathNodes(link.source.title)}</span><span className="font-mono text-[10px] text-muted">{link.source.code}</span></span>
          </button>
          <p className="pl-3 text-[11px] italic text-muted">↓ {dirLabel}</p>
          <button onClick={() => onPick(link.target.id)} className="flex w-full items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 text-left transition hover:bg-white/90">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: RELATION_HEX[rel] }}>B</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{mathNodes(link.target.title)}</span><span className="font-mono text-[10px] text-muted">{link.target.code}</span></span>
          </button>
        </div>

        {e.quanNiemSai && (
          <div className="rounded-xl border border-warn-line bg-warn-bg/50 px-3 py-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-warn"><AlertTriangle size={12} strokeWidth={2} />Quan niệm sai</p>
            <div>{renderRich(e.quanNiemSai)}</div>
          </div>
        )}
        {e.remediationHint && (
          <div className="rounded-xl border border-brand-line/60 bg-brand-bg/50 px-3 py-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand"><Compass size={12} strokeWidth={2} />Gợi ý khắc phục</p>
            <div>{renderRich(e.remediationHint)}</div>
          </div>
        )}
        {e.crossSubject && <p className="text-[11px] text-muted">Liên môn: <b className="text-ink-2">{e.crossSubject}</b></p>}
        {!e.quanNiemSai && !e.remediationHint && (
          <p className="rounded-lg bg-white/40 px-3 py-3 text-center text-[11px] text-muted">Cạnh này chưa có ghi chú quan niệm sai / gợi ý khắc phục.</p>
        )}
      </div>
    </>
  );
}
