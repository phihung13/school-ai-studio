"use client";
import React, { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, FolderOpen, AlertTriangle, Play, Loader2, Clapperboard, Film, Lightbulb } from "lucide-react";
import Shell, { Breadcrumb } from "@/components/shell";
import MdMindmap from "@/components/md-mindmap";
import { getData, api, Card, PageLoading, LoadError, Button, AssetBadge, Spinner, useToast, cls, FormatIcon, M } from "@/components/ui";
import { TreeNode, Pkg, Asset, User, FORMAT_LABEL, LEVEL_LABEL, STATUS_LABEL, niceTicks, SLIDE_TEMPLATES } from "@/lib/shared";
import { assembleVeoPrompt } from "@/lib/video-kit";

interface AssetData { asset: Asset; pkg: Pkg; atom: TreeNode; ancestors: TreeNode[] }

// ---------- Renderers ----------
// Slide v2 — CÙNG một JSON với file PPTX tải về (bảng, biểu đồ, bước, cảnh báo) → web khớp file
interface SlideChart { type: "line" | "bar"; categories: string[]; series: { name: string; values: number[] }[]; xLabel?: string; yLabel?: string }
interface SlideCard { icon?: string; title: string; text?: string }
interface DecorEl { kind: "blob" | "ring" | "sticker" | "chip" | "arrow" | "line"; x: number; y: number; w?: number; h?: number; size?: number; text?: string; color?: string; opacity?: number; x2?: number; y2?: number; front?: boolean }
interface SlideV2 { title: string; icon?: string; bullets?: string[]; steps?: string[]; cards?: SlideCard[]; stat?: { value: string; label: string }; table?: { headers: string[]; rows: string[][] }; chart?: SlideChart; warn?: boolean; notes?: string; decor?: DecorEl[] }

const CHART_COLORS = ["#1E4D38", "#B08A3C", "#2E6B4F"];
function ChartSvg({ chart }: { chart: SlideChart }) {
  const W = 720, H = 380, P = { l: 62, r: 18, t: 32, b: chart.xLabel ? 58 : 40 }; // t=32: chừa chỗ nhãn đỉnh + legend
  const all = chart.series.flatMap((s) => s.values);
  // trục theo "vạch đẹp" (bước 1/2/5×10ⁿ) — giá trị dữ liệu luôn nằm gọn trong lưới, nhãn không lẻ
  const { ticks, lo: min, hi: max } = niceTicks(Math.min(0, ...all), Math.max(...all, 1));
  const n = chart.categories.length;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = (i: number) => P.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const Y = (v: number) => P.t + ih - ((v - min) * ih) / (max - min || 1);
  const y0 = Y(0); // gốc 0 — cột âm mọc XUỐNG từ đây, không dính đáy khung
  const bw = Math.min(46, (iw / n) * 0.6 / chart.series.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={chart.yLabel || "biểu đồ"}>
      {ticks.map((t, k) => (
        <g key={k}>
          <line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} stroke="#E7EDE8" strokeWidth={1} />
          <text x={P.l - 8} y={Y(t) + 4} textAnchor="end" fontSize={12} fill="#6B7A6E">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={y0} y2={y0} stroke="#9AAA9E" strokeWidth={1.4} />
      <line x1={P.l} x2={P.l} y1={P.t} y2={Y(min)} stroke="#9AAA9E" strokeWidth={1.4} />
      {chart.categories.map((cat, i) => (
        <text key={i} x={chart.type === "bar" ? P.l + (i + 0.5) * (iw / n) : X(i)} y={H - P.b + 20} textAnchor="middle" fontSize={12.5} fill="#26332B">{cat}</text>
      ))}
      {chart.xLabel && <text x={P.l + iw / 2} y={H - 8} textAnchor="middle" fontSize={12.5} fill="#6B7A6E">{chart.xLabel}</text>}
      {chart.yLabel && <text x={14} y={P.t + ih / 2} textAnchor="middle" fontSize={12.5} fill="#6B7A6E" transform={`rotate(-90 14 ${P.t + ih / 2})`}>{chart.yLabel}</text>}
      {chart.series.map((se, si) => chart.type === "bar" ? (
        <g key={si}>
          {se.values.map((v, i) => {
            const gx = P.l + (i + 0.5) * (iw / n) - (bw * chart.series.length) / 2 + si * bw;
            return <g key={i}>
              <rect x={gx} y={Math.min(Y(v), y0)} width={bw - 3} height={Math.max(1, Math.abs(y0 - Y(v)))} rx={3} fill={CHART_COLORS[si % 3]} />
              <text x={gx + (bw - 3) / 2} y={v >= 0 ? Y(v) - 6 : Y(v) + 15} textAnchor="middle" fontSize={12} fontWeight={600} fill="#26332B">{v}</text>
            </g>;
          })}
        </g>
      ) : (
        <g key={si}>
          <polyline points={se.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} fill="none" stroke={CHART_COLORS[si % 3]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {se.values.map((v, i) => (
            <g key={i}>
              <circle cx={X(i)} cy={Y(v)} r={5} fill="#fff" stroke={CHART_COLORS[si % 3]} strokeWidth={2.6} />
              <text x={X(i)} y={Y(v) - 11} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="#26332B">{v}</text>
            </g>
          ))}
        </g>
      ))}
      {chart.series.length > 1 && (() => {
        // legend xếp CỘNG DỒN theo độ dài tên (cắt 22 ký tự) — hết cảnh tên dài đè nhau ở bước 150px cứng
        let lx = P.l;
        return chart.series.map((se, si) => {
          const name = se.name.length > 22 ? se.name.slice(0, 21) + "…" : se.name;
          const el = (
            <g key={`lg${si}`}>
              <rect x={lx} y={4} width={12} height={12} rx={3} fill={CHART_COLORS[si % 3]} />
              <text x={lx + 17} y={14} fontSize={12} fill="#26332B">{name}</text>
            </g>
          );
          lx += 27 + name.length * 6.6;
          return el;
        });
      })()}
    </svg>
  );
}

// Hình số liệu minh hoạ đi kèm mindmap/flashcard (chart do AI đính, đã qua sanitizeChart phía server)
function SideChart({ chart, label = "SỐ LIỆU MINH HOẠ" }: { chart?: SlideChart; label?: string }) {
  if (!chart) return null;
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold tracking-[0.14em] text-brass">{label}</p>
      <div className="mx-auto max-w-2xl"><ChartSvg chart={chart} /></div>
    </Card>
  );
}

// Xem trước slide REALTIME bằng CHÍNH theme thật (iframe → /api/slide-preview, render marp-core).
// Khớp y hệt file PPTX/PDF tải về; bấm đổi mẫu (tpl) là preview đổi ngay.
function SlideView({ assetId, slides, tpl }: { assetId: string; slides: SlideV2[]; tpl: string }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLIFrameElement>(null);
  const n = slides.length;
  const s = slides[i];
  // đổi slide → nhắn iframe hiện slide i (không tải lại); đổi MẪU → key đổi → iframe remount lấy CSS mới.
  useEffect(() => { ref.current?.contentWindow?.postMessage({ t: "slide", i }, "*"); }, [i]);
  if (!s) return null;
  // KHÔNG kèm &i vào src: đổi slide chỉ postMessage (tức thì). src đổi khi đổi MẪU → key remount → onLoad
  // gửi lại slide hiện tại. (i vẫn nằm trong closure của onLoad.)
  const src = `/api/slide-preview?assetId=${encodeURIComponent(assetId)}&theme=${encodeURIComponent(tpl)}`;
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line bg-[#0c2b1f] shadow-sm" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          key={`${assetId}-${tpl}`}
          ref={ref}
          src={src}
          title="Xem trước slide"
          onLoad={() => ref.current?.contentWindow?.postMessage({ t: "slide", i }, "*")}
          className="h-full w-full border-0"
        />
      </div>
      {s.notes && (
        <p className="mt-2 flex items-start gap-2 rounded-md bg-brass-bg px-3 py-2 text-xs text-brass-ink">
          <Lightbulb size={14} className="mt-0.5 shrink-0" />Ghi chú cho giáo viên: <M>{s.notes}</M>
        </p>
      )}
      <div className="mt-3 flex items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>← Trước</Button>
        <span className="text-sm text-muted">{i + 1} / {n}</span>
        <Button variant="secondary" onClick={() => setI(Math.min(n - 1, i + 1))} disabled={i === n - 1}>Sau →</Button>
      </div>
    </div>
  );
}

const DOK_LABEL: Record<number, string> = { 1: "Nhận biết", 2: "Thông hiểu", 3: "Vận dụng" };

function QuizView({ content }: { content: { questions: { type: string; q: string; options?: string[]; answer: unknown; explanation?: string; dok?: number; misconceptionRef?: string }[] } }) {
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [checked, setChecked] = useState(false);
  const score = content.questions.filter((q, i) => {
    if (q.type === "mcq") return Number(answers[i]) === Number(q.answer);
    if (q.type === "tf") return answers[i] === q.answer;
    return String(answers[i] || "").trim().toLowerCase() === String(q.answer).trim().toLowerCase();
  }).length;
  return (
    <div className="space-y-4">
      {content.questions.map((q, i) => (
        <Card key={i} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium text-ink">Câu {i + 1}. <M>{q.q}</M></p>
            {q.dok && <span className="shrink-0 rounded-full bg-brass-bg px-2 py-0.5 text-[11px] font-semibold text-brass-ink">DOK {q.dok} · {DOK_LABEL[q.dok]}</span>}
          </div>
          {q.type === "mcq" && q.options && (
            <div className="mt-2 space-y-1.5">
              {q.options.map((o, j) => {
                const isAns = checked && j === Number(q.answer);
                const isPicked = Number(answers[i]) === j;
                return (
                  <label key={j} className={cls("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                    isAns ? "border-ok-line bg-ok-bg" : checked && isPicked ? "border-danger-line bg-danger-bg" : isPicked ? "border-brand bg-brand-bg" : "border-line hover:bg-surface-2")}>
                    <input type="radio" name={`q${i}`} checked={isPicked} onChange={() => setAnswers({ ...answers, [i]: j })} disabled={checked} className="accent-[oklch(0.44_0.13_27)]" />
                    <span className="text-ink-2"><M>{o}</M></span>
                  </label>
                );
              })}
            </div>
          )}
          {q.type === "tf" && (
            <div className="mt-2 flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => !checked && setAnswers({ ...answers, [i]: v })}
                  className={cls("rounded-md border px-4 py-2 text-sm font-medium transition",
                    checked && v === q.answer ? "border-ok-line bg-ok-bg text-ok" : answers[i] === v ? "border-brand bg-brand-bg text-brand-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                  {v ? "Đúng" : "Sai"}
                </button>
              ))}
            </div>
          )}
          {q.type === "fill" && (
            <input value={String(answers[i] ?? "")} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} disabled={checked}
              placeholder="Điền câu trả lời…" className="mt-2 w-full max-w-xs rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
          )}
          {checked && q.explanation && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-info-bg px-3 py-2 text-xs text-info"><Lightbulb size={13} className="mt-0.5 shrink-0" /><span><M>{q.explanation}</M>{q.type === "fill" && ` (Đáp án: ${String(q.answer)})`}</span></p>}
          {checked && q.misconceptionRef && <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-warn-bg px-3 py-2 text-xs text-warn"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>Phương án nhiễu bám quan niệm sai thật: <M>{q.misconceptionRef}</M></span></p>}
        </Card>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={() => setChecked(true)} disabled={checked}>Chấm bài</Button>
        {checked && <span className="text-sm font-semibold text-ink">Kết quả: {score}/{content.questions.length} câu đúng</span>}
        {checked && <Button variant="secondary" onClick={() => { setChecked(false); setAnswers({}); }}>Làm lại</Button>}
      </div>
    </div>
  );
}

// Mindmap tương tác (zoom, kéo, thu gọn nhánh) — cùng engine markmap với file HTML xuất ra

function FlashcardView({ content }: { content: { cards: { front: string; back: string }[] } }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = content.cards[i];
  if (!card) return null;
  return (
    <div className="flex flex-col items-center">
      <div className={cls("flip-card h-64 w-full max-w-lg cursor-pointer", flipped && "flipped")} onClick={() => setFlipped(!flipped)}>
        <div className="flip-inner h-full w-full">
          <div className="flip-face flex items-center justify-center rounded-xl border border-brand-line bg-surface p-8 text-center shadow-sm">
            <p className="whitespace-pre-wrap font-display text-lg font-semibold text-ink"><M>{card.front}</M></p>
          </div>
          <div className="flip-face flip-back flex items-center justify-center overflow-y-auto rounded-xl bg-brand p-6 shadow-sm scrollthin">
            <p className={cls("max-h-full whitespace-pre-wrap font-medium text-on-brand", card.back.length > 200 ? "text-left text-sm leading-relaxed" : "text-center text-base")}><M>{card.back}</M></p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Bấm vào thẻ để lật</p>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" onClick={() => { setI(Math.max(0, i - 1)); setFlipped(false); }} disabled={i === 0}>← Trước</Button>
        <span className="text-sm text-muted">{i + 1} / {content.cards.length}</span>
        <Button variant="secondary" onClick={() => { setI(Math.min(content.cards.length - 1, i + 1)); setFlipped(false); }} disabled={i === content.cards.length - 1}>Sau →</Button>
      </div>
    </div>
  );
}

function PodcastView({ assetId, content }: { assetId: string; content: { script: { speaker: string; text: string }[] } }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // KHÔNG dùng speechSynthesis: máy Windows thường chỉ cài MỘT giọng vi-VN, nên vai nam và vai nữ
  // rơi vào cùng một giọng (chỉ khác cao độ) — cô nghe ra nam, trò nghe ra nữ. Phát thẳng MP3 do
  // server dựng bằng edge-tts: cô = giọng nữ thật, trò nam = giọng nam thật, mọi máy nghe như nhau.
  const load = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/export?assetId=${encodeURIComponent(assetId)}&variant=mp3`);
      if (!r.ok) throw new Error((await r.text()) || `Máy chủ trả ${r.status}`);
      setSrc(URL.createObjectURL(await r.blob()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  return (
    <div>
      <div className="mb-4 rounded-lg bg-brand p-4">
        {src ? (
          <audio controls autoPlay src={src} className="w-full" />
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={load} disabled={busy} aria-label="Phát" className="flex h-12 w-12 items-center justify-center rounded-full bg-on-brand text-brand shadow transition hover:scale-105 disabled:opacity-60">
              {busy ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} className="ml-0.5" />}
            </button>
            <div>
              <p className="text-sm font-semibold text-on-brand">{busy ? "Đang dựng audio giọng Việt thật…" : "Nghe bản MP3 giọng Việt thật"}</p>
              <p className="text-xs text-on-brand/70">
                {err ? `Lỗi: ${err}` : busy ? "Mỗi lượt thoại được thu riêng — chờ khoảng nửa phút." : "Cô Mai giọng nữ · Bin giọng nam — dựng bằng edge-tts, không phụ thuộc giọng máy."}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {content.script.map((l, i) => {
          const teacher = /cô|thầy|giáo/i.test(l.speaker);
          return (
            <div key={i} className={cls("flex gap-3 rounded-md p-3", !teacher && "flex-row-reverse")}>
              <span className={cls("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", teacher ? "bg-brand-bg text-brand-ink" : "bg-brass-bg text-brass-ink")}>
                {l.speaker.trim().slice(-1).toUpperCase()}
              </span>
              <div className={cls("rounded-lg border border-line bg-surface px-3.5 py-2", !teacher && "bg-brass-bg/40")}>
                <p className="text-[11px] font-semibold text-muted">{l.speaker}</p>
                <p className="text-sm text-ink-2"><M>{l.text}</M></p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface VideoScene { beat?: string; role?: "veo" | "avatar" | "graphics"; setting?: string; visual: string; dialogue?: { speaker: string; line: string; action?: string }[]; onScreenText?: string; giaiThichCongThuc?: string; animation?: string; veoAction?: string; veoCast?: string[]; mucTieu?: string; narration?: string; durationSec?: number }
const ROLE_TAG: Record<string, { label: string; cls: string }> = {
  veo: { label: "QUAY · VEO", cls: "bg-brand/10 text-brand" },
  avatar: { label: "AVATAR · DƯƠNG", cls: "bg-brass/15 text-brass-ink" },
  graphics: { label: "ĐỒ HOẠ", cls: "bg-info-bg text-info" },
};
function VideoView({ content }: { content: { videoTitle?: string; logline?: string; characters?: { name: string; role?: string }[]; scenes: VideoScene[]; durationSec?: number; style?: string } }) {
  const total = content.durationSec || content.scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
  const mm = Math.floor(total / 60), ss = total % 60;
  return (
    <div>
      <p className="mb-3 flex items-start gap-2 rounded-md bg-info-bg px-3 py-2 text-xs text-info">
        <Clapperboard size={14} className="mt-0.5 shrink-0" />
        Kịch bản video 7 nhịp (~{total ? `${mm}:${String(ss).padStart(2, "0")}` : "≤3:00"} phút · {content.style || "hoạt hình 2D + quay thực"}). Mỗi cảnh ghi rõ <b>kênh dựng</b> (Veo / avatar Dương / đồ hoạ) kèm prompt Veo tiếng Anh. Tải <b>DOCX</b> để có trọn bộ pack (cơ chế tự ngưng, style &amp; character bible, hướng dẫn kỹ thuật, checklist).
      </p>
      {content.videoTitle && <p className="mb-1 text-base font-semibold text-brand-deep"><M>{content.videoTitle}</M></p>}
      {content.logline && <p className="mb-1 text-sm text-ink-2"><b className="text-ink">Tình huống:</b> <i><M>{content.logline}</M></i></p>}
      {!!content.characters?.length && (
        <p className="mb-3 text-xs text-muted"><b className="text-ink-2">Nhân vật:</b> {content.characters.map((c, i) => <span key={i}>{i > 0 && " · "}<M>{c.name}</M>{c.role ? ` (${c.role})` : ""}</span>)}</p>
      )}
      <div className="space-y-3">
        {content.scenes.map((s, i) => {
          const tag = s.role ? ROLE_TAG[s.role] : undefined;
          return (
          <Card key={i} className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass/15 text-brass-ink"><Film size={15} strokeWidth={1.75} /></span>
              <p className="text-xs font-semibold text-brand">CẢNH {i + 1}{s.beat ? <span className="ml-1.5 font-medium uppercase tracking-wide text-brass-ink">· {s.beat}</span> : null}</p>
              {tag && <span className={cls("rounded-full px-2 py-0.5 text-[10px] font-semibold", tag.cls)}>{tag.label}</span>}
              {s.durationSec ? <span className="ml-auto text-[11px] text-muted">{s.durationSec}s</span> : null}
            </div>
            <div className="p-4">
              {s.setting && <p className="mb-1.5 text-xs italic text-muted"><M>{s.setting}</M></p>}
              <p className="text-xs text-muted"><b className="text-ink-2">Hình ảnh:</b> <M>{s.visual}</M></p>
              {s.dialogue?.length ? (
                <div className="mt-2.5 space-y-1.5">
                  {s.dialogue.map((d, k) => (
                    <p key={k} className="text-sm text-ink-2"><b className="text-brand-deep">{d.speaker}:</b> <M>{d.line}</M>{d.action ? <i className="ml-1 text-xs text-muted"> {d.action}</i> : null}</p>
                  ))}
                </div>
              ) : s.narration ? (
                <p className="mt-2 text-sm text-ink-2"><b>Lời thoại:</b> “<M>{s.narration}</M>”</p>
              ) : null}
              {s.giaiThichCongThuc && <p className="mt-2 text-xs text-ink-2"><b className="text-ink-2">Giải thích công thức:</b> <M>{s.giaiThichCongThuc}</M></p>}
              {s.onScreenText && <p className="mt-2 text-xs text-ink-2"><b className="text-ink-2">Chữ trên màn:</b> “<M>{s.onScreenText}</M>”</p>}
              {s.animation && <p className="mt-2 text-xs text-muted"><b className="text-ink-2">Animation:</b> <M>{s.animation}</M></p>}
              {s.role === "veo" && s.veoAction && (
                <div className="mt-2.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand">Prompt Veo (tiếng Anh){s.veoCast?.length ? ` · ${s.veoCast.join(", ")}` : ""}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2/60 p-2 text-[11px] leading-relaxed text-ink-2">{assembleVeoPrompt(s.veoAction, s.veoCast)}</pre>
                </div>
              )}
              {s.mucTieu && <p className="mt-2 text-[11px] italic text-brass-ink"><b className="not-italic">Mục tiêu:</b> <M>{s.mucTieu}</M></p>}
            </div>
          </Card>
          );
        })}
      </div>
    </div>
  );
}

// **đậm** markdown → đậm thật, giữ xuống dòng (khớp bản in PDF/DOCX). body có thể thiếu → "" cho khỏi crash.
function bodyPara(text: string, key: number) {
  return (
    <p key={key} className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
      {text.split(/\*\*(.+?)\*\*/g).map((part, k) =>
        k % 2 ? <strong key={k} className="font-semibold text-ink"><M>{part}</M></strong> : <M key={k}>{part}</M>
      )}
    </p>
  );
}
const TBL_SEP = /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/; // dòng ngăn "|---|---|"
const cells = (ln: string) => ln.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
// Tách body thành khối: bảng markdown → <table> thật; còn lại → đoạn văn (trước đây bảng hiện THÔ dấu "|").
function renderBody(body: string): React.ReactNode[] {
  const lines = (body || "").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push(bodyPara(para.join("\n"), out.length)); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const startsTable = /\|/.test(lines[i]) && lines[i].trim() && i + 1 < lines.length && TBL_SEP.test(lines[i + 1]);
    if (startsTable) {
      flush();
      let j = i;
      const rows: string[] = [];
      while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim()) { rows.push(lines[j]); j++; }
      const header = cells(rows[0]);
      const dataRows = rows.slice(2).map(cells);
      out.push(
        <div key={out.length} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{header.map((h, k) => <th key={k} className="border border-line-strong bg-surface-2 px-2.5 py-1.5 text-left font-semibold text-ink"><M>{h}</M></th>)}</tr></thead>
            <tbody>{dataRows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-line px-2.5 py-1.5 text-ink-2"><M>{c}</M></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      i = j - 1;
    } else para.push(lines[i]);
  }
  flush();
  return out;
}
function SectionsView({ content }: { content: { sections: { heading: string; body: string; chart?: SlideChart }[]; answers?: string[] } }) {
  return (
    <div className="space-y-4">
      {(content.sections || []).map((s, i) => (
        <Card key={i} className="p-5">
          <h3 className="font-display font-semibold text-ink"><M>{s.heading || ""}</M></h3>
          <div className="mt-2 space-y-2">{renderBody(s.body || "")}</div>
          {s.chart && (
            <div className="mt-3 rounded-lg border border-line bg-surface p-3">
              <p className="text-[11px] font-bold tracking-[0.14em] text-brass">SỐ LIỆU MINH HOẠ</p>
              <ChartSvg chart={s.chart} />
            </div>
          )}
        </Card>
      ))}
      {!!content.answers?.length && (
        <Card className="p-5">
          <details>
            <summary className="cursor-pointer font-display text-sm font-semibold text-brass">Đáp án tự kiểm — làm xong mới xem nhé</summary>
            <ol className="mt-3 space-y-1.5 text-sm text-ink-2">
              {content.answers.map((a, i) => (
                <li key={i} className="flex gap-2"><span className="font-bold text-brand-deep">{i + 1}.</span><M>{a}</M></li>
              ))}
            </ol>
          </details>
        </Card>
      )}
    </div>
  );
}

// ---------- Page ----------
export default function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AssetData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState("va-green");   // mẫu trình bày đã chọn (chỉ dùng cho slide)
  const [toast, show] = useToast();

  const load = useCallback(() => { getData<AssetData>("asset", { id }).then(setData).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  if (err) return <Shell user={me}><LoadError msg={err} /></Shell>;
  if (!data) return <Shell user={me}><PageLoading /></Shell>;
  const { asset, pkg, atom } = data;
  const canEdit = me && me.role !== "principal";

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await api<{ asset: Asset }>("generateAsset", { pkgId: pkg.id, format: asset.format });
      show("Đã sinh lại từ phiên bản gói mới nhất");
      window.location.href = `/asset/${res.asset.id}`;
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); setBusy(false); }
  };

  const exportExt: Record<string, string> = { slide: "PPTX", text: "PDF (bài đọc)", worksheet: "PDF (in đẹp)", podcast: "DOCX (kịch bản)", video: "DOCX (storyboard)", quiz: "GIFT (Moodle/Forms)", mindmap: "HTML tương tác", flashcard: "CSV (Quizlet)" };

  const c = asset.content as never;
  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <Breadcrumb items={[{ label: "Cây kiến thức", href: "/tree" }, { label: atom.title, href: `/atom/${atom.id}` }, { label: `${FORMAT_LABEL[asset.format]} · mức ${pkg.level}` }]} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="inline-flex items-center gap-2 font-display text-xl font-semibold text-ink lg:text-2xl"><FormatIcon format={asset.format} size={22} className="text-brand" />{FORMAT_LABEL[asset.format]}: <M>{atom.title}</M></h1>
          <AssetBadge status={asset.status} />
          <span className="text-xs text-muted">mức {pkg.level} · {LEVEL_LABEL[pkg.level]} · sinh từ gói v{asset.pkgVersion} · {asset.model}</span>
        </div>

        {pkg.status !== "approved" && (
          <Card className="mt-3 flex items-start gap-2 border-brass-line bg-brass-bg/50 p-3 text-xs text-brass-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Học liệu này sinh từ gói <b>chưa thẩm định</b> (trạng thái gói: {STATUS_LABEL[pkg.status]}). Trong app học sinh chỉ dùng học liệu từ gói Chuẩn trường — hãy duyệt gói trước khi phát hành.
          </Card>
        )}

        {asset.status === "outdated" && (
          <Card className="mt-3 flex flex-wrap items-center gap-3 border-warn-line bg-warn-bg/60 p-4">
            <p className="flex flex-1 items-start gap-2 text-sm text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" />Gói tri thức gốc đã được sửa (hiện là v{pkg.version}, học liệu này sinh từ v{asset.pkgVersion}). Nên sinh lại để nội dung khớp bản mới nhất.</p>
            {canEdit && <Button onClick={regenerate} disabled={busy}>{busy ? <Spinner label="Đang sinh lại…" /> : <><RefreshCw size={15} />Sinh lại ngay</>}</Button>}
          </Card>
        )}

        {asset.format === "slide" && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Chọn mẫu trình bày — mỗi ô là chính bài NÀY trong tông đó; đổi mẫu áp cho cả deck, không sinh lại</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {SLIDE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTpl(t.id)}
                  title={t.desc}
                  className={cls(
                    "group shrink-0 overflow-hidden rounded-xl border bg-surface text-left transition",
                    tpl === t.id ? "border-brand ring-2 ring-brand/25" : "border-line hover:border-brand/40",
                  )}
                  style={{ width: 172 }}
                >
                  {/* xem trước SỐNG: chính bài này (bìa) trong tông của mẫu — pointer-events-none để click chọn mẫu,
                      loading=lazy để ô ngoài vùng cuộn mới render (đỡ nặng máy chủ) */}
                  <div className="h-[97px] w-[172px] bg-[#0c2b1f]">
                    <iframe
                      src={`/api/slide-preview?assetId=${asset.id}&theme=${t.id}`}
                      title={t.label}
                      loading="lazy"
                      tabIndex={-1}
                      scrolling="no"
                      className="pointer-events-none block h-[97px] w-[172px] border-0"
                    />
                  </div>
                  <div className="px-3 py-2">
                    <p className={cls("truncate text-[13px] font-semibold", tpl === t.id ? "text-brand" : "text-ink")}>{t.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {asset.format === "slide" ? (
            <>
              <a href={`/api/export?assetId=${asset.id}&variant=pptx-${tpl}`}>
                <Button variant="secondary"><Download size={15} />Tải PPTX</Button>
              </a>
              <a href={`/api/export?assetId=${asset.id}&variant=pdf-${tpl}`}>
                <Button variant="secondary"><Download size={15} />Tải PDF</Button>
              </a>
            </>
          ) : (
            <a href={`/api/export?assetId=${asset.id}`}>
              <Button variant="secondary"><Download size={15} />Tải {exportExt[asset.format]}</Button>
            </a>
          )}
          {asset.format === "flashcard" && (
            <a href={`/api/export?assetId=${asset.id}&variant=apkg`}>
              <Button variant="secondary"><Download size={15} />Tải APKG (Anki)</Button>
            </a>
          )}
          {asset.format === "podcast" && (
            <a href={`/api/export?assetId=${asset.id}&variant=mp3`}>
              <Button variant="secondary"><Download size={15} />Tải MP3 (giọng Việt thật)</Button>
            </a>
          )}
          {(asset.format === "quiz" || asset.format === "flashcard" || asset.format === "slide" || asset.format === "podcast") && (
            <a href={`/api/export?assetId=${asset.id}&variant=html`}>
              <Button variant="secondary"><Download size={15} />Tải HTML tương tác</Button>
            </a>
          )}
          {canEdit && asset.status !== "outdated" && (
            <Button variant="ghost" onClick={regenerate} disabled={busy}>{busy ? <Spinner /> : <><RefreshCw size={15} />Sinh lại</>}</Button>
          )}
          <Link href={`/package/${pkg.id}`}><Button variant="ghost"><FolderOpen size={15} />Mở gói tri thức gốc</Button></Link>
        </div>

        <div className="mt-6">
          {asset.format === "slide" && <SlideView assetId={asset.id} slides={(c as { slides: SlideV2[] }).slides} tpl={tpl} />}
          {asset.format === "quiz" && <QuizView content={c} />}
          {asset.format === "mindmap" && (
            <div className="space-y-4">
              <Card className="p-3"><MdMindmap markdown={(c as { markdown: string }).markdown} className="h-[28rem] w-full" /></Card>
              <SideChart chart={(c as { chart?: SlideChart }).chart} />
            </div>
          )}
          {asset.format === "flashcard" && (
            <div className="space-y-4">
              <FlashcardView content={c} />
              <SideChart chart={(c as { chart?: SlideChart }).chart} label="SỐ LIỆU THAM KHẢO CHO BỘ THẺ" />
            </div>
          )}
          {asset.format === "podcast" && <PodcastView assetId={asset.id} content={c} />}
          {asset.format === "video" && <VideoView content={c} />}
          {(asset.format === "text" || asset.format === "worksheet") && <SectionsView content={c} />}
        </div>

        <p className="mt-6 text-xs text-muted">Sinh lúc {new Date(asset.createdAt).toLocaleString("vi-VN")} bởi {asset.createdBy} · {asset.tokens.toLocaleString("vi-VN")} token · ${asset.costUsd}</p>
      </div>
    </Shell>
  );
}
