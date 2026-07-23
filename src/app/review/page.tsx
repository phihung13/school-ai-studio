"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Undo2, ScanSearch, AlertTriangle, Check, PartyPopper } from "lucide-react";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, Button, Empty, LoadError, useToast, timeAgo, cls } from "@/components/ui";
import { TreeNode, Pkg, Review, User, LEVEL_LABEL, LEVEL_COLOR } from "@/lib/shared";

interface ReviewData { pending: { pkg: Pkg; atom: TreeNode; chain: string }[]; history: Review[]; canReview?: boolean; subject?: string | null }

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [toast, show] = useToast();

  const load = useCallback(() => {
    setErr(null);
    getData<ReviewData>("review").then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Không tải được hàng chờ duyệt"));
  }, []);
  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  if (err) return <Shell user={me}><LoadError msg={err} backHref="/" onRetry={load} /></Shell>;
  if (!data) return <Shell user={me}><PageLoading /></Shell>;
  const canReview = me && (me.role === "lead" || me.role === "admin");

  const decide = async (id: string, decision: "approved" | "returned") => {
    setBusy(id + decision);
    try {
      await api("decidePackage", { id, decision, note: note[id] || "" });
      show(decision === "approved" ? "Đã duyệt lên Chuẩn trường 🎉" : "Đã trả lại kèm góp ý");
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-semibold text-ink">Chờ duyệt của tổ{data.subject ? ` ${data.subject}` : ""}</h1>
          {data.pending.length > 0 && <span className="rounded-full bg-brass px-2.5 py-0.5 text-xs font-bold text-on-brand">{data.pending.length} gói</span>}
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-2">Giáo viên trong tổ bấm <b>Gửi duyệt</b> là gói hiện ngay ở đây — không phải mò trong nhật ký. AI Reviewer đã chấm trước theo 6 tiêu chí; cờ cảnh báo là chỗ nên đọc kỹ. Quyết định cuối thuộc về tổ trưởng.{data.subject ? " Bạn chỉ thấy gói thuộc môn của mình." : ""}</p>

        {!canReview && (
          <Card className="mt-4 flex items-center gap-2 border-warn-line bg-warn-bg p-4 text-sm text-warn">
            <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0" />
            Tài khoản của bạn không có quyền duyệt — trang này chỉ để xem.
          </Card>
        )}

        <div className="mt-6 space-y-4">
          {data.pending.length === 0 && <Empty icon={<PartyPopper size={28} strokeWidth={1.75} />} title="Không còn gói nào chờ duyệt" hint="Khi giáo viên bấm Gửi duyệt, gói sẽ xuất hiện ở đây kèm báo cáo chấm trước của AI." />}
          {data.pending.map(({ pkg, atom, chain }) => (
            <Card key={pkg.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/package/${pkg.id}`} className="font-display text-base font-semibold text-ink hover:text-brand hover:underline">{atom?.title}</Link>
                <span className={cls("rounded-full px-2.5 py-0.5 text-xs font-semibold", LEVEL_COLOR[pkg.level])}>Mức {pkg.level} · {LEVEL_LABEL[pkg.level]}</span>
                <span className="text-xs text-muted">v{pkg.version} · {pkg.updatedBy} · {timeAgo(pkg.updatedAt)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{chain}</p>
              <p className="mt-2 line-clamp-2 text-sm text-ink-2">{pkg.fields.objective}</p>

              {pkg.aiReport && (
                <div className="mt-3 rounded-md border border-brass-line bg-brass-bg p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-brass-ink"><ScanSearch size={15} strokeWidth={1.75} className="shrink-0" />AI Reviewer: {pkg.aiReport.summary}</p>
                  {pkg.aiReport.flags.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {pkg.aiReport.flags.map((f, i) => <li key={i} className="flex items-start gap-1.5 text-xs text-ink-2"><AlertTriangle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warn" />{f}</li>)}
                    </ul>
                  )}
                  {pkg.aiReport.flags.length === 0 && <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2"><CheckCircle2 size={13} strokeWidth={1.75} className="shrink-0 text-ok" />Không có cờ cảnh báo.</p>}
                </div>
              )}

              {canReview && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input value={note[pkg.id] || ""} onChange={(e) => setNote({ ...note, [pkg.id]: e.target.value })}
                    placeholder="Ghi chú / góp ý (bắt buộc khi trả lại)…"
                    className="min-w-64 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
                  <Link href={`/package/${pkg.id}`}><Button variant="secondary">Xem chi tiết</Button></Link>
                  <Button variant="danger" disabled={!!busy || !(note[pkg.id] || "").trim()} onClick={() => decide(pkg.id, "returned")}><Undo2 size={16} strokeWidth={1.75} />Trả lại</Button>
                  <Button disabled={!!busy} onClick={() => decide(pkg.id, "approved")}><CheckCircle2 size={16} strokeWidth={1.75} />Duyệt Chuẩn trường</Button>
                </div>
              )}
            </Card>
          ))}
        </div>

        {data.history.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 font-display text-lg font-semibold text-ink">Đã quyết định gần đây</h2>
            <Card className="divide-y divide-line">
              {data.history.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cls("shrink-0", r.decision === "approved" ? "text-ok" : "text-ink-2")}>
                    {r.decision === "approved" ? <Check size={16} strokeWidth={2} /> : <Undo2 size={16} strokeWidth={1.75} />}
                  </span>
                  <Link href={`/package/${r.packageId}`} className="font-medium text-ink hover:text-brand hover:underline">{r.packageId}</Link>
                  <span className="flex-1 truncate text-ink-2">{r.by}{r.note ? ` — ${r.note}` : ""}</span>
                  <span className="text-xs text-muted">{timeAgo(r.at)}</span>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
