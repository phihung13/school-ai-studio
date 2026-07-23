"use client";
import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Save, Send, CheckCircle2, Undo2, ScanSearch, Wand2, History, Target, AlertTriangle, HelpCircle, FolderOpen } from "lucide-react";
import Shell, { Breadcrumb } from "@/components/shell";
import { getData, api, Card, PageLoading, LoadError, Button, StatusBadge, Spinner, useToast, Modal, cls, timeAgo, FormatIcon, M } from "@/components/ui";
import { TreeNode, Pkg, PkgFields, Asset, User, AiReport, Review, FIELD_LABEL, LEVEL_LABEL, LEVEL_COLOR, FORMAT_LABEL, STATUS_LABEL } from "@/lib/shared";

interface PkgData { pkg: Pkg; atom: TreeNode; ancestors: TreeNode[]; assets: Asset[]; reviews: Review[] }
const FIELD_KEYS: (keyof PkgFields)[] = ["objective", "explanation", "example", "counterExample", "commonMistake", "strategy", "questions"];
const FIELD_HINT: Record<keyof PkgFields, string> = {
  objective: "Học sinh làm được gì sau khi học? (kèm mức Bloom)",
  explanation: "Cách trình bày khái niệm phù hợp mức độ — có câu chốt dễ nhớ",
  example: "2–3 ví dụ chuẩn, ưu tiên tình huống Việt Nam gần gũi",
  counterExample: "Trường hợp trông giống nhưng KHÔNG áp dụng được",
  commonMistake: "Hiểu lầm phổ biến + cách chữa",
  strategy: "Gợi ý dẫn dắt, thang câu hỏi Socratic",
  questions: "Câu hỏi đánh số theo mức độ — nguồn cho quiz và đề",
};

export default function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PkgData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [fields, setFields] = useState<PkgFields | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiField, setAiField] = useState<keyof PkgFields | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [decideMode, setDecideMode] = useState<"approved" | "returned" | null>(null);
  const [decideNote, setDecideNote] = useState("");
  const [decideOverride, setDecideOverride] = useState(false);
  const [toast, show] = useToast();

  const load = useCallback(() => {
    getData<PkgData>("package", { id }).then((d) => {
      setData(d); setFields({ ...d.pkg.fields }); setDirty(false); setReport(d.pkg.aiReport || null);
    }).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (err) return <Shell user={me}><LoadError msg={err} /></Shell>;
  if (!data || !fields) return <Shell user={me}><PageLoading /></Shell>;
  const { pkg, atom } = data;
  const canEdit = me && me.role !== "principal";
  const canReview = me && (me.role === "lead" || me.role === "admin");
  const hasFlags = (pkg.aiReport?.flags?.length || 0) > 0;
  const decideDisabled =
    !!busy ||
    (decideMode === "returned" && !decideNote.trim()) ||
    (decideMode === "approved" && hasFlags && (!decideOverride || !decideNote.trim()));

  const set = (k: keyof PkgFields, v: string) => { setFields({ ...fields, [k]: v }); setDirty(true); };

  const save = async () => {
    setBusy("save");
    try {
      await api("savePackage", { id: pkg.id, fields });
      show("Đã lưu — học liệu đã sinh từ bản cũ được đánh dấu Cần cập nhật");
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  const submit = async () => {
    setBusy("submit");
    try {
      if (dirty) await api("savePackage", { id: pkg.id, fields });
      await api("submitPackage", { id: pkg.id });
      show("Đã gửi duyệt — AI Reviewer đã chấm trước cho tổ trưởng");
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  const openDecide = (decision: "approved" | "returned") => {
    setDecideMode(decision);
    setDecideNote("");
    setDecideOverride(false);
  };

  const confirmDecide = async () => {
    if (!decideMode) return;
    const decision = decideMode;
    setBusy(decision);
    try {
      const payload: Record<string, unknown> = { id: pkg.id, decision, note: decideNote.trim() };
      if (decision === "approved" && hasFlags) payload.override = true;
      await api("decidePackage", payload);
      show(decision === "approved" ? "Đã duyệt lên Chuẩn trường" : "Đã trả lại cho giáo viên");
      setDecideMode(null);
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  const runReview = async () => {
    setBusy("review");
    try {
      const res = await api<{ report: AiReport }>("reviewNow", { pkgId: pkg.id });
      setReport(res.report);
      show("AI Reviewer đã chấm xong");
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  const askAi = async () => {
    if (!aiField) return;
    setBusy("ai");
    try {
      const res = await api<{ text: string }>("rewriteField", { pkgId: pkg.id, field: aiField, instruction: aiInstruction });
      setAiResult(res.text);
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <Breadcrumb items={[{ label: "Cây kiến thức", href: "/tree" }, ...data.ancestors.map((a) => ({ label: a.title })), { label: atom.title, href: `/atom/${atom.id}` }, { label: `Mức ${pkg.level}` }]} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl font-semibold text-ink lg:text-2xl">Gói tri thức: <M>{atom.title}</M></h1>
          <span className={cls("rounded-full px-3 py-1 text-xs font-semibold", LEVEL_COLOR[pkg.level])}>Mức {pkg.level} · {LEVEL_LABEL[pkg.level]}</span>
          <StatusBadge status={pkg.status} />
          <span className="text-xs text-muted">v{pkg.version} · Bloom: {pkg.bloom}</span>
          <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><History size={13} />Lịch sử</button>
        </div>

        <div className="sticky top-0 max-lg:top-[49px] lg:top-0 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8" style={{ zIndex: 20 }}>
          {canEdit && <Button onClick={save} disabled={!dirty || !!busy}>{busy === "save" ? <Spinner /> : <><Save size={15} />Lưu</>}</Button>}
          {canEdit && pkg.status !== "pending_review" && pkg.status !== "approved" && (
            <Button variant="secondary" onClick={submit} disabled={!!busy}>{busy === "submit" ? <Spinner /> : <><Send size={15} />Gửi duyệt</>}</Button>
          )}
          {canReview && pkg.status === "pending_review" && (
            <>
              <Button onClick={() => openDecide("approved")} disabled={!!busy}><CheckCircle2 size={15} />Duyệt Chuẩn trường</Button>
              <Button variant="danger" onClick={() => openDecide("returned")} disabled={!!busy}><Undo2 size={15} />Trả lại</Button>
            </>
          )}
          {canEdit && <Button variant="ghost" onClick={runReview} disabled={!!busy}>{busy === "review" ? <Spinner /> : <><ScanSearch size={15} />AI Reviewer chấm thử</>}</Button>}
          {dirty && <span className="inline-flex items-center gap-1 text-xs font-medium text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn" />Có thay đổi chưa lưu</span>}
        </div>

        {report && (
          <Card className="mt-4 border-brass-line bg-brass-bg/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><ScanSearch size={16} className="text-brass-ink" />AI Reviewer — {report.summary}</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {report.criteria.map((c) => (
                <p key={c.name} className="flex items-start gap-1.5 text-xs text-ink-2">
                  {c.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />}
                  <span><b className="text-ink">{c.name}:</b> {c.note}</span>
                </p>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">AI chỉ nêu điểm cần chú ý — quyết định cuối luôn thuộc về giáo viên/tổ trưởng.</p>
          </Card>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            {FIELD_KEYS.map((k) => (
              <Card key={k} className="scroll-mt-20 p-4">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-semibold text-ink">{FIELD_LABEL[k]}</label>
                  {canEdit && (
                    <button onClick={() => { setAiField(k); setAiInstruction(""); setAiResult(null); }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand-bg"><Wand2 size={13} />AI hỗ trợ</button>
                  )}
                </div>
                <p className="mb-2 text-[11px] text-muted">{FIELD_HINT[k]}</p>
                <textarea value={fields[k]} onChange={(e) => set(k, e.target.value)} disabled={!canEdit}
                  rows={k === "explanation" ? 7 : k === "questions" ? 5 : 3}
                  className="w-full resize-y rounded-md border border-line bg-surface-2/60 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand focus:bg-surface disabled:cursor-not-allowed disabled:opacity-70" />
              </Card>
            ))}
          </div>

          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="max-h-[70vh] overflow-y-auto p-5 scrollthin">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Xem trước — như học sinh sẽ thấy</p>
              <h2 className="font-display text-lg font-semibold text-ink"><M>{atom.title}</M></h2>
              <p className="mt-0.5 text-xs text-muted">Mức {pkg.level} · {LEVEL_LABEL[pkg.level]}</p>
              <div className="mt-4 space-y-4">
                <div className="flex gap-2 rounded-md bg-brand-bg p-3 text-sm text-brand-deep"><Target size={16} className="mt-0.5 shrink-0" /><span><b>Mục tiêu:</b> <M>{fields.objective}</M></span></div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2"><M>{fields.explanation}</M></div>
                <div className="rounded-md border border-ok-line bg-ok-bg/60 p-3">
                  <p className="text-xs font-semibold text-ok">VÍ DỤ</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2"><M>{fields.example}</M></p>
                </div>
                <div className="rounded-md border border-warn-line bg-warn-bg/60 p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle size={13} />CẨN THẬN</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2"><M>{fields.counterExample}</M></p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2"><M>{fields.commonMistake}</M></p>
                </div>
                <div className="rounded-md bg-surface-2 p-3">
                  <p className="flex items-center gap-1 text-xs font-semibold text-ink-2"><HelpCircle size={13} />TỰ KIỂM TRA</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2"><M>{fields.questions}</M></p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold text-ink">Học liệu sinh từ gói này</p>
              {data.assets.length === 0 && <p className="text-xs text-muted">Chưa có — mở trang nguyên tử để sinh từ ma trận.</p>}
              <div className="flex flex-wrap gap-2">
                {data.assets.map((a) => (
                  <Link key={a.id} href={`/asset/${a.id}`}
                    className={cls("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:shadow-sm",
                      a.status === "outdated" ? "border-warn-line bg-warn-bg text-warn" : "border-line bg-surface text-ink-2 hover:border-brand")}>
                    <FormatIcon format={a.format} size={14} /> {FORMAT_LABEL[a.format]}{a.status === "outdated" && " · cần cập nhật"}
                  </Link>
                ))}
              </div>
              <Link href={`/atom/${atom.id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline"><FolderOpen size={13} />Mở ma trận học liệu</Link>
            </Card>
          </div>
        </div>
      </div>

      <Modal open={!!decideMode} onClose={() => setDecideMode(null)} title={decideMode === "returned" ? "Trả lại cho giáo viên" : "Duyệt lên Chuẩn trường"}>
        {decideMode === "approved" && hasFlags && (
          <div className="mb-3 rounded-md border border-warn-line bg-warn-bg/60 p-3 text-sm text-warn">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} className="shrink-0" />Gói còn {pkg.aiReport!.flags.length} cờ cảnh báo từ AI Reviewer</p>
            <p className="mt-1 text-xs text-ink-2">Muốn duyệt vẫn cần xác nhận ghi đè và ghi rõ lý do.</p>
          </div>
        )}
        <p className="mb-2 text-sm text-ink-2">
          {decideMode === "returned"
            ? "Ghi rõ lý do trả lại / góp ý cho giáo viên (bắt buộc)."
            : "Ghi chú duyệt" + (hasFlags ? " (bắt buộc khi còn cảnh báo)." : " (tùy chọn).")}
        </p>
        <textarea value={decideNote} onChange={(e) => setDecideNote(e.target.value)} rows={4}
          placeholder={decideMode === "returned" ? "VD: Ví dụ chưa sát chuẩn khối lớp, cần bổ sung…" : "VD: Đã rà soát các điểm AI nêu, nội dung đạt yêu cầu…"}
          className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand" />
        {decideMode === "approved" && hasFlags && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={decideOverride} onChange={(e) => setDecideOverride(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
            <span>Xác nhận duyệt dù còn cảnh báo</span>
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDecideMode(null)} disabled={!!busy}>Hủy</Button>
          <Button variant={decideMode === "returned" ? "danger" : "primary"} onClick={confirmDecide} disabled={decideDisabled}>
            {busy === decideMode ? <Spinner /> : decideMode === "returned" ? <><Undo2 size={15} />Trả lại</> : <><CheckCircle2 size={15} />Duyệt Chuẩn trường</>}
          </Button>
        </div>
      </Modal>

      <Modal open={!!aiField} onClose={() => setAiField(null)} title={`AI hỗ trợ — ${aiField ? FIELD_LABEL[aiField] : ""}`} wide>
        <p className="mb-2 text-sm text-ink-2">AI viết lại trường này theo yêu cầu của cô/thầy. Kết quả chỉ thay vào ô khi bấm “Dùng bản này” — quyền quyết định luôn ở giáo viên.</p>
        <div className="flex gap-2">
          <input value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)} placeholder="VD: ngắn gọn hơn, thêm ví dụ về tiền Việt, dễ hiểu cho học sinh yếu…"
            className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
          <Button onClick={askAi} disabled={busy === "ai"}>{busy === "ai" ? <Spinner label="Đang viết…" /> : "Viết lại"}</Button>
        </div>
        {aiResult && (
          <div className="mt-4">
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-brand-line bg-brand-bg/40 p-3 text-sm text-ink-2 scrollthin">{aiResult}</div>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => { if (aiField && aiResult) { set(aiField, aiResult); setAiField(null); } }}><CheckCircle2 size={15} />Dùng bản này</Button>
              <Button variant="secondary" onClick={askAi} disabled={busy === "ai"}>Viết lại lần nữa</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Lịch sử phiên bản">
        <div className="space-y-3">
          {[...pkg.history].reverse().map((h, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-bg font-mono text-[10px] font-semibold text-brand-ink">v{h.version}</span>
              <div>
                <p className="text-ink">{h.note}</p>
                <p className="text-xs text-muted">{h.by} · {timeAgo(h.at)}</p>
              </div>
            </div>
          ))}
          {data.reviews.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Quyết định duyệt</p>
              {data.reviews.map((r) => (
                <p key={r.id} className="flex items-start gap-1.5 text-sm text-ink-2">
                  {r.decision === "approved" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-ok" /> : <Undo2 size={14} className="mt-0.5 shrink-0 text-ink-2" />}
                  <span><b className="text-ink">{r.by}</b> — {STATUS_LABEL[r.decision === "approved" ? "approved" : "edited"]}{r.note ? `: ${r.note}` : ""} <span className="text-xs text-muted">({timeAgo(r.at)})</span></span>
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </Shell>
  );
}
