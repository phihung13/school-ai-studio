"use client";
import React, { useEffect, useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, RefreshCw, Network, Link2, Sparkles, FileJson, ArrowUpRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { api, getData, Card, Button, useToast, cls } from "./ui";

interface ImportResult { errors: string[]; atomsNew: number; atomsUpdated: number; atomsSkipped: number; edgesNew: number; edgesUpdated: number; edgesSkipped: number; nodesCreated: number; applied: boolean; sampleNew: string[] }
interface RefsResult { errors: string[]; attached: number; skipped: number; nodesTouched: number; applied: boolean }
interface QuestionsResult { errors: string[]; created: number; updated: number; skipped: number; atomsTouched: number; applied: boolean }
interface Stats { atoms: number; edges: number; outdated: number; subjects: number }

function readJson(f: File): Promise<unknown> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { try { res(JSON.parse(String(r.result))); } catch { rej(new Error(`"${f.name}" không phải JSON hợp lệ`)); } }; r.onerror = () => rej(new Error("Không đọc được file")); r.readAsText(f); });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asArr = (v: any, key: string): unknown[] => Array.isArray(v) ? v : (Array.isArray(v?.[key]) ? v[key] : []);

function FilePick({ label, hint, accept, file, onFile }: { label: string; hint: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className={cls("flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition", file ? "border-brand bg-brand-bg/40" : "border-line-strong hover:border-brand hover:bg-surface-2")}>
      <span className={cls("grid h-9 w-9 shrink-0 place-items-center rounded-lg", file ? "bg-brand-bg text-brand-ink" : "bg-surface-2 text-muted")}><FileJson size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-muted">{file ? file.name : hint}</span>
      </span>
      {file && <span className="text-[11px] font-medium text-brand">✓</span>}
      <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
    </label>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return <div className="rounded-lg bg-surface-2/60 px-3 py-2 text-center"><p className={cls("font-display text-lg font-semibold", tone || "text-ink")}>{n}</p><p className="text-[10px] text-muted">{label}</p></div>;
}

export default function ImportPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [toast, show] = useToast();
  const load = () => getData<Stats>("importStats").then(setStats).catch(() => {});
  useEffect(() => { load(); }, []);

  // ── Làn 1: cây phân rã ──
  const [atomsFile, setAtomsFile] = useState<File | null>(null);
  const [edgesFile, setEdgesFile] = useState<File | null>(null);
  const [diff, setDiff] = useState<ImportResult | null>(null);
  const [busy1, setBusy1] = useState(false);

  const runKnowledge = async (dryRun: boolean) => {
    setBusy1(true);
    try {
      let atoms: unknown[] = [], edges: unknown[] = [];
      if (atomsFile) { const a = await readJson(atomsFile); atoms = asArr(a, "atoms"); edges = asArr(a, "edges"); }
      if (edgesFile) { const e = await readJson(edgesFile); edges = edges.length ? edges : asArr(e, "edges"); }
      if (!atoms.length && !edges.length) { show("Chưa có nguyên tử/cạnh nào trong file", "err"); setBusy1(false); return; }
      const r = await api("importKnowledge", { atoms, edges, dryRun }) as { result: ImportResult };
      setDiff(r.result);
      if (!dryRun) { show(`Đã áp dụng — ${r.result.atomsNew} nguyên tử mới, ${r.result.atomsUpdated} cập nhật, ${r.result.edgesNew} cạnh`); setAtomsFile(null); setEdgesFile(null); setDiff(null); load(); }
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy1(false);
  };

  // ── Làn 2: ngân hàng câu hỏi ──
  const [qFile, setQFile] = useState<File | null>(null);
  const [qDiff, setQDiff] = useState<QuestionsResult | null>(null);
  const [busyQ, setBusyQ] = useState(false);
  const runQuestions = async (dryRun: boolean) => {
    if (!qFile) { show("Chọn file câu hỏi trước", "err"); return; }
    setBusyQ(true);
    try {
      const questions = asArr(await readJson(qFile), "questions");
      if (!questions.length) { show("File không có câu hỏi nào", "err"); setBusyQ(false); return; }
      const r = await api("importQuestions", { questions, dryRun }) as { result: QuestionsResult };
      setQDiff(r.result);
      if (!dryRun) { show(`Đã nạp ${r.result.created} câu mới · ${r.result.updated} cập nhật — phủ ${r.result.atomsTouched} nguyên tử`); setQFile(null); setQDiff(null); }
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusyQ(false);
  };

  // ── Làn 3: tài liệu tham khảo ──
  const [refsFile, setRefsFile] = useState<File | null>(null);
  const [refsDiff, setRefsDiff] = useState<RefsResult | null>(null);
  const [busy2, setBusy2] = useState(false);
  const runRefs = async (dryRun: boolean) => {
    if (!refsFile) { show("Chọn file tài liệu trước", "err"); return; }
    setBusy2(true);
    try {
      const refs = asArr(await readJson(refsFile), "refs");
      if (!refs.length) { show("File không có tài liệu nào", "err"); setBusy2(false); return; }
      const r = await api("importRefs", { refs, dryRun }) as { result: RefsResult };
      setRefsDiff(r.result);
      if (!dryRun) { show(`Đã gắn ${r.result.attached} tài liệu vào ${r.result.nodesTouched} mục`); setRefsFile(null); setRefsDiff(null); }
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy2(false);
  };

  // ── Làn 3: học liệu quá hạn ──
  const [busy3, setBusy3] = useState(false);
  const refresh = async () => {
    setBusy3(true);
    try { const r = await api("refreshOutdated", {}) as { count: number }; show(r.count ? `Đã tạo đơn làm mới ${r.count} học liệu — theo dõi ở Xưởng sản xuất` : "Không có học liệu nào quá hạn"); load(); }
    catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy3(false);
  };

  return (
    <div className="fade-up space-y-5">
      {toast}
      <p className="max-w-3xl text-sm text-ink-2">
        App <b className="text-ink">chỉ nhận file đã chuẩn hoá</b> (đúng schema) — không đọc thẳng kho Drive lộn xộn. Việc <b>hiểu Drive chi tiết/rác → xuất file sạch</b> do AI mạnh (Claude Opus / skill <span className="font-mono text-xs">kg-*</span>) làm ở ngoài. App kiểm tra khuôn, <b>xem trước thay đổi</b> rồi mới ghi, và <b>không xoá</b> nội dung đã biên soạn.
      </p>
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <Stat n={stats.subjects} label="môn" />
          <Stat n={stats.atoms} label="nguyên tử" tone="text-brand" />
          <Stat n={stats.edges} label="cạnh nối" tone="text-info" />
          <Stat n={stats.outdated} label="học liệu quá hạn" tone={stats.outdated ? "text-warn" : "text-ink"} />
        </div>
      )}

      {/* ══ Làn 1 ══ */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><Network size={18} className="text-brand" /><h2 className="font-display text-base font-semibold text-ink">Cây phân rã — nguyên tử & cạnh nối</h2></div>
        <p className="mt-1 text-xs text-muted">Nhập/cập nhật nguyên tử và liên kết. Upsert theo <b className="text-ink-2">mã</b> — mã cũ được cập nhật metadata (giữ nguyên gói, tài liệu, trạng thái duyệt), mã mới được tạo và tự đặt vào đúng chương/cụm.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <FilePick label="File nguyên tử (atoms)" hint="JSON: [{code,label,cluster,type,bloom,dok,nangLuc,yeuCau,chapter,grade,subject}]" accept=".json,application/json" file={atomsFile} onFile={(f) => { setAtomsFile(f); setDiff(null); }} />
          <FilePick label="File cạnh nối (edges) — tuỳ chọn" hint="JSON: [{from,to,relation,weight,quanNiemSai,remediationHint}]" accept=".json,application/json" file={edgesFile} onFile={(f) => { setEdgesFile(f); setDiff(null); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => runKnowledge(true)} disabled={busy1 || (!atomsFile && !edgesFile)}><UploadCloud size={15} /> Kiểm tra & xem trước</Button>
          {diff && <Button onClick={() => runKnowledge(false)} disabled={busy1}><CheckCircle2 size={15} /> Áp dụng thay đổi</Button>}
        </div>
        {diff && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat n={diff.atomsNew} label="nguyên tử mới" tone="text-ok" />
              <Stat n={diff.atomsUpdated} label="cập nhật" tone="text-info" />
              <Stat n={diff.atomsSkipped} label="bỏ qua" tone={diff.atomsSkipped ? "text-warn" : "text-ink"} />
              <Stat n={diff.edgesNew} label="cạnh mới" tone="text-ok" />
              <Stat n={diff.edgesUpdated} label="cạnh sửa" tone="text-info" />
              <Stat n={diff.nodesCreated} label="chương/cụm tạo" />
            </div>
            {diff.sampleNew.length > 0 && <p className="mt-2 text-[11px] text-muted">Mã mới (mẫu): <span className="font-mono text-ink-2">{diff.sampleNew.join(", ")}</span></p>}
            {diff.errors.length > 0 && (
              <div className="mt-2 rounded-lg border border-warn-line bg-warn-bg/50 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warn"><AlertTriangle size={12} /> {diff.errors.length} dòng bị chặn (không hợp lệ — sẽ bỏ qua):</p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[11px] text-ink-2 scrollthin">
                  {diff.errors.slice(0, 40).map((e, i) => <li key={i}>• {e}</li>)}
                  {diff.errors.length > 40 && <li className="text-muted">… và {diff.errors.length - 40} dòng nữa</li>}
                </ul>
              </div>
            )}
            {!diff.applied && <p className="mt-2 text-[11px] text-muted">Đây là bản xem trước — chưa ghi gì. Bấm <b className="text-ink-2">Áp dụng</b> để trộn vào dữ liệu.</p>}
          </div>
        )}
      </Card>

      {/* ══ Làn 2: ngân hàng câu hỏi ══ */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><ListChecks size={18} className="text-ok" /><h2 className="font-display text-base font-semibold text-ink">Ngân hàng câu hỏi — gắn theo nguyên tử</h2></div>
        <p className="mt-1 text-xs text-muted">Câu hỏi do kho sản xuất kèm phân rã (không phải AI sinh). Mỗi câu phải trỏ vào <b className="text-ink-2">mã nguyên tử</b> đã có; câu trỏ mã lạ sẽ bị chặn. Nạp lại nhiều lần không đẻ trùng.</p>
        <div className="mt-3 max-w-md">
          <FilePick label="File câu hỏi (questions)" hint="JSON: [{id,atom,noiDung,dapAn,loiGiai,dok,doKho,nhieu:[{noiDung,lyDo}]}]" accept=".json,application/json" file={qFile} onFile={(f) => { setQFile(f); setQDiff(null); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => runQuestions(true)} disabled={busyQ || !qFile}><UploadCloud size={15} /> Kiểm tra & xem trước</Button>
          {qDiff && <Button onClick={() => runQuestions(false)} disabled={busyQ}><CheckCircle2 size={15} /> Nạp {qDiff.created + qDiff.updated} câu</Button>}
        </div>
        {qDiff && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="grid grid-cols-4 gap-2">
              <Stat n={qDiff.created} label="câu mới" tone="text-ok" />
              <Stat n={qDiff.updated} label="cập nhật" tone="text-info" />
              <Stat n={qDiff.skipped} label="bỏ qua" tone={qDiff.skipped ? "text-warn" : "text-ink"} />
              <Stat n={qDiff.atomsTouched} label="nguyên tử được phủ" />
            </div>
            {qDiff.errors.length > 0 && (
              <div className="mt-2 rounded-lg border border-warn-line bg-warn-bg/50 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warn"><AlertTriangle size={12} /> {qDiff.errors.length} câu bị chặn:</p>
                <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-ink-2 scrollthin">{qDiff.errors.slice(0, 30).map((e, i) => <li key={i}>• {e}</li>)}</ul>
              </div>
            )}
            {!qDiff.applied && <p className="mt-2 text-[11px] text-muted">Bản xem trước — chưa ghi gì.</p>}
          </div>
        )}
      </Card>

      {/* ══ Làn 3 ══ */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><Link2 size={18} className="text-info" /><h2 className="font-display text-base font-semibold text-ink">Tài liệu tham khảo — gắn hàng loạt</h2></div>
        <p className="mt-1 text-xs text-muted">Gắn link Drive / SGK / video vào node theo <b className="text-ink-2">mã</b>. Link trùng sẽ bỏ qua; chỉ nhận http/https.</p>
        <div className="mt-3 max-w-md">
          <FilePick label="File tài liệu (refs)" hint='JSON: [{code,title,url,kind}] — kind: drive|sgk|video|link' accept=".json,application/json" file={refsFile} onFile={(f) => { setRefsFile(f); setRefsDiff(null); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => runRefs(true)} disabled={busy2 || !refsFile}><UploadCloud size={15} /> Kiểm tra</Button>
          {refsDiff && <Button onClick={() => runRefs(false)} disabled={busy2}><CheckCircle2 size={15} /> Gắn {refsDiff.attached} tài liệu</Button>}
        </div>
        {refsDiff && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat n={refsDiff.attached} label="sẽ gắn" tone="text-ok" />
              <Stat n={refsDiff.nodesTouched} label="mục" tone="text-info" />
              <Stat n={refsDiff.skipped} label="bỏ qua/trùng" tone={refsDiff.skipped ? "text-warn" : "text-ink"} />
            </div>
            {refsDiff.errors.length > 0 && <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-warn scrollthin">{refsDiff.errors.slice(0, 30).map((e, i) => <li key={i}>• {e}</li>)}</ul>}
          </div>
        )}
      </Card>

      {/* ══ Làn 3 ══ */}
      <Card className="p-5">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-brand" /><h2 className="font-display text-base font-semibold text-ink">Học liệu đã sinh — làm mới bản quá hạn</h2></div>
        <p className="mt-1 text-xs text-muted">Khi gói nội dung đổi, các slide/quiz… sinh từ nó bị đánh dấu <b className="text-warn">quá hạn</b>. Bấm để sinh lại (tạo một đơn trong Xưởng sản xuất).</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={refresh} disabled={busy3 || !(stats && stats.outdated > 0)}><RefreshCw size={15} className={busy3 ? "animate-spin" : ""} /> Làm mới {stats?.outdated || 0} học liệu quá hạn</Button>
          <Link href="/batch" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Mở Xưởng sản xuất <ArrowUpRight size={13} /></Link>
        </div>
      </Card>
    </div>
  );
}
