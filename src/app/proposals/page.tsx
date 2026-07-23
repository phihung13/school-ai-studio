"use client";
import React, { useCallback, useEffect, useState } from "react";
import { Sprout, Send, CheckCircle2, X } from "lucide-react";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, Button, Empty, useToast, timeAgo, cls, Modal, Spinner } from "@/components/ui";
import { Proposal, User } from "@/lib/shared";

const KIND_LABEL: Record<Proposal["kind"], string> = { add: "Thêm nguyên tử", edit: "Sửa nội dung", merge: "Gộp nguyên tử", split: "Tách nguyên tử" };

export default function ProposalsPage() {
  const [me, setMe] = useState<User | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [kind, setKind] = useState<Proposal["kind"]>("edit");
  const [target, setTarget] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [decideTarget, setDecideTarget] = useState<{ id: string; decision: "accepted" | "rejected" } | null>(null);
  const [decideNote, setDecideNote] = useState("");
  const [toast, show] = useToast();

  const load = useCallback(() => { getData<{ proposals: Proposal[] }>("proposals").then((d) => setProposals(d.proposals)).catch(() => {}); }, []);
  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  if (!proposals) return <Shell user={me}><PageLoading /></Shell>;
  const canDecide = me && (me.role === "lead" || me.role === "admin");
  const canPropose = me && me.role !== "principal";

  const submit = async () => {
    setBusy(true);
    try {
      await api("createProposal", { kind, targetTitle: target, description: desc });
      show("Đã gửi đề xuất cho tổ bộ môn");
      setTarget(""); setDesc("");
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  const openDecide = (id: string, decision: "accepted" | "rejected") => {
    setDecideTarget({ id, decision });
    setDecideNote("");
  };

  const confirmDecide = async () => {
    if (!decideTarget) return;
    const { id, decision } = decideTarget;
    setBusy(true);
    try {
      await api("decideProposal", { id, decision, note: decideNote.trim() });
      show(decision === "accepted" ? "Đã chấp nhận — quản trị học thuật sẽ cập nhật cây" : "Đã từ chối");
      setDecideTarget(null);
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink">Đề xuất sửa cây kiến thức</h1>
        <p className="mt-1 text-sm text-ink-2">Cây là bản nền nạp từ phân rã đã thẩm định — giáo viên không sửa trực tiếp mà gửi đề xuất, tổ trưởng duyệt (giống pull request).</p>

        {canPropose && (
          <Card className="mt-5 p-5">
            <p className="mb-3 text-sm font-semibold text-ink">Gửi đề xuất mới</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABEL) as Proposal["kind"][]).map((k) => (
                <button key={k} onClick={() => setKind(k)}
                  className={cls("rounded-full border px-3 py-1.5 text-xs font-medium transition", kind === k ? "border-brand bg-brand-bg text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Nguyên tử / vị trí liên quan (VD: T6.1.4.1c — Vận dụng tính nhanh)"
              className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Mô tả đề xuất và lý do sư phạm…"
              className="mt-2 w-full rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand" />
            <Button className="mt-3" onClick={submit} disabled={busy || !target.trim() || !desc.trim()}><Send size={16} strokeWidth={1.75} aria-hidden /> Gửi đề xuất</Button>
          </Card>
        )}

        <div className="mt-6 space-y-3">
          {proposals.length === 0 && <Empty icon={<Sprout size={28} strokeWidth={1.5} aria-hidden />} title="Chưa có đề xuất nào" />}
          {proposals.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cls("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  p.status === "open" ? "bg-info-bg text-info" : p.status === "accepted" ? "bg-ok-bg text-ok" : "bg-surface-2 text-muted")}>
                  {p.status === "open" ? "Đang mở" : p.status === "accepted" ? "Đã chấp nhận" : "Đã từ chối"}
                </span>
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">{KIND_LABEL[p.kind]}</span>
                <b className="text-sm font-semibold text-ink">{p.targetTitle}</b>
                <span className="ml-auto text-xs text-muted">{p.by} · {timeAgo(p.at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{p.description}</p>
              {p.status !== "open" && p.decidedBy && <p className="mt-2 text-xs text-muted">Quyết định bởi {p.decidedBy}{p.note ? ` — ${p.note}` : ""}</p>}
              {p.status === "open" && canDecide && (
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => openDecide(p.id, "accepted")}><CheckCircle2 size={16} strokeWidth={1.75} aria-hidden /> Chấp nhận</Button>
                  <Button variant="danger" onClick={() => openDecide(p.id, "rejected")}><X size={16} strokeWidth={1.75} aria-hidden /> Từ chối</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <Modal open={!!decideTarget} onClose={() => setDecideTarget(null)} title={decideTarget?.decision === "rejected" ? "Từ chối đề xuất" : "Chấp nhận đề xuất"}>
        <p className="mb-2 text-sm text-ink-2">
          {decideTarget?.decision === "rejected"
            ? "Ghi rõ lý do từ chối để giáo viên hiểu (bắt buộc)."
            : "Ghi chú khi chấp nhận — quản trị học thuật sẽ cập nhật cây (tùy chọn)."}
        </p>
        <textarea value={decideNote} onChange={(e) => setDecideNote(e.target.value)} rows={4}
          placeholder={decideTarget?.decision === "rejected" ? "VD: Đề xuất trùng với nguyên tử đã có, chưa đủ căn cứ sư phạm…" : "VD: Hợp lý, sẽ bổ sung vào đợt cập nhật cây tới…"}
          className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDecideTarget(null)} disabled={busy}>Hủy</Button>
          <Button variant={decideTarget?.decision === "rejected" ? "danger" : "primary"} onClick={confirmDecide}
            disabled={busy || (decideTarget?.decision === "rejected" && !decideNote.trim())}>
            {busy ? <Spinner /> : decideTarget?.decision === "rejected" ? <><X size={16} strokeWidth={1.75} aria-hidden /> Từ chối</> : <><CheckCircle2 size={16} strokeWidth={1.75} aria-hidden /> Chấp nhận</>}
          </Button>
        </div>
      </Modal>
    </Shell>
  );
}
