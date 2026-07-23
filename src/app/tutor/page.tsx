"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GraduationCap, Target, AlertTriangle, Send, Sparkles, PartyPopper, BrainCircuit } from "lucide-react";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, Spinner, useToast, cls, FormatIcon } from "@/components/ui";
import { TreeNode, Pkg, Asset, AssetFormat, User, LEVEL_LABEL } from "@/lib/shared";
import FlashcardReview from "@/components/flashcard-review";

// Nhãn thân thiện với trẻ em cho từng định dạng học liệu.
const KID_FORMAT_LABEL: Record<AssetFormat, string> = {
  quiz: "Trò chơi hỏi đáp", podcast: "Nghe kể chuyện", video: "Xem phim ngắn", flashcard: "Thẻ lật ghi nhớ",
  mindmap: "Sơ đồ tư duy", slide: "Bài giảng chiếu", text: "Bài đọc", worksheet: "Phiếu bài tập",
};

interface TutorAtom extends TreeNode { chain: string; approved: number; any: number }
interface TutorTree { subjects: TreeNode[]; atoms: TutorAtom[] }
interface TutorData { atom: TreeNode; chain: string; packages: Pkg[]; assets: Asset[] }
interface Msg { role: "user" | "bot"; text: string }

export default function TutorPage() {
  const [me, setMe] = useState<User | null>(null);
  const [tree, setTree] = useState<TutorTree | null>(null);
  const [atomId, setAtomId] = useState("");
  const [data, setData] = useState<TutorData | null>(null);
  const [level, setLevel] = useState(1);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    getData<TutorTree>("tutorTree").then((t) => {
      setTree(t);
      const hero = t.atoms.find((a) => a.approved > 0) || t.atoms[0];
      if (hero) setAtomId(hero.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!atomId) return;
    setData(null); setMsgs([]);
    getData<TutorData>("tutor", { id: atomId }).then((d) => {
      setData(d);
      const approved = d.packages.filter((p) => p.status === "approved");
      setLevel((approved[0] || d.packages[0])?.level || 1);
    }).catch(() => {});
  }, [atomId]);

  useEffect(() => { chatRef.current?.scrollTo({ top: 99999, behavior: "smooth" }); }, [msgs]);

  const ask = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await api<{ text: string }>("tutorChat", { atomId, question, history: msgs.slice(-6).map((m) => ({ role: m.role, text: m.text })) });
      setMsgs((m) => [...m, { role: "bot", text: res.text }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Xin lỗi, cô gặp trục trặc — em thử lại nhé!" }]);
    }
    setBusy(false);
  };

  if (!tree) return <Shell user={me}><PageLoading /></Shell>;
  const pkg = data?.packages.find((p) => p.level === level);
  const pkgAssets = data?.assets.filter((a) => a.packageId === pkg?.id) || [];

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="inline-flex items-center gap-2 font-display text-2xl font-semibold text-ink"><GraduationCap size={26} className="text-brand" />Xem như học sinh</h1>
          <span className="rounded-full bg-ok-bg px-3 py-1 text-xs font-semibold text-ok">Mô phỏng app Việt Anh Personal Tutor</span>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-2">Đây là cách học sinh nhìn thấy nội dung. Gói chưa thẩm định sẽ hiện cảnh báo.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select value={atomId} onChange={(e) => setAtomId(e.target.value)}
            className="w-full max-w-md rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand">
            {tree.atoms.map((a) => <option key={a.id} value={a.id}>{a.chain} › {a.title} {a.approved > 0 ? "✓" : "(chưa duyệt)"}</option>)}
          </select>
          {data && (
            <div className="flex gap-1.5">
              {data.packages.map((p) => (
                <button key={p.id} onClick={() => setLevel(p.level)}
                  className={cls("rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    level === p.level ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-2 hover:border-brand")}>
                  Mức {p.level} · {LEVEL_LABEL[p.level]}{p.status === "approved" ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        {!data ? <div className="mt-5"><PageLoading /></div> : (
          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Card className="overflow-hidden">
                <div className="bg-brand px-5 py-4">
                  <p className="text-xs text-on-brand/70">{data.chain}</p>
                  <h2 className="font-display text-lg font-semibold text-on-brand">{data.atom.title}</h2>
                </div>
                {pkg ? (
                  <div className="space-y-4 p-5">
                    {pkg.status !== "approved" && (
                      <p className="flex items-start gap-2 rounded-md border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Nội dung chưa được thầy cô thẩm định — trong app thật, học sinh chỉ thấy nội dung Chuẩn trường.</p>
                    )}
                    <div className="flex gap-2 rounded-md bg-brand-bg p-3 text-sm text-brand-deep"><Target size={16} className="mt-0.5 shrink-0" /><span><b>Hôm nay em sẽ học:</b> {pkg.fields.objective}</span></div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{pkg.fields.explanation.replace("【Nháp AI — cần giáo viên rà soát】\n", "")}</div>
                    <div className="rounded-md border border-ok-line bg-ok-bg/60 p-3">
                      <p className="text-xs font-semibold text-ok">VÍ DỤ</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{pkg.fields.example}</p>
                    </div>
                    <div className="rounded-md border border-warn-line bg-warn-bg/60 p-3">
                      <p className="flex items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle size={13} />CÁC BẠN HAY NHẦM</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{pkg.fields.commonMistake}</p>
                    </div>
                    {pkgAssets.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted">Học theo cách em thích</p>
                        <div className="flex flex-wrap gap-2">
                          {pkgAssets.map((a) => (
                            <Link key={a.id} href={`/asset/${a.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink-2 transition hover:border-brand hover:text-brand-ink">
                              <FormatIcon format={a.format} size={20} className="text-brand" /> {KID_FORMAT_LABEL[a.format]}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => show("Giỏi lắm! Em đã hiểu bài này rồi 🎉")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ok-line bg-ok-bg px-3.5 py-2 text-sm font-semibold text-ok transition hover:brightness-95 active:translate-y-px">
                      <PartyPopper size={16} strokeWidth={1.75} aria-hidden /> Em đã hiểu bài này 🎉
                    </button>
                  </div>
                ) : (
                  <p className="p-5 text-sm text-muted">Mức này chưa có gói tri thức.</p>
                )}
              </Card>

              <Card className="mt-5 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line bg-brand-bg/50 px-5 py-3">
                  <BrainCircuit size={18} className="text-brand-ink" />
                  <p className="font-display text-sm font-semibold text-ink">Ôn thẻ ghi nhớ — lịch ôn thông minh</p>
                </div>
                <div className="p-5">
                  <FlashcardReview atomId={data.atom.id} />
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="flex h-[520px] flex-col overflow-hidden">
                <div className="border-b border-line px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles size={16} className="text-brass-ink" />Hỏi gia sư AI</p>
                </div>
                <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto p-4 scrollthin">
                  {msgs.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted">Gợi ý câu hỏi:</p>
                      {["Cho em một ví dụ", "Vì sao lại như vậy ạ?", "Các bạn hay nhầm chỗ nào?", "Cho em bài tập luyện"].map((s) => (
                        <button key={s} onClick={() => ask(s)} className="block w-full rounded-md border border-brand-line bg-brand-bg/50 px-3 py-2 text-left text-sm text-brand-ink transition hover:bg-brand-bg">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {msgs.map((m, i) => (
                    <div key={i} className={cls("flex", m.role === "user" && "justify-end")}>
                      <div className={cls("max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                        m.role === "user" ? "bg-brand text-on-brand" : "bg-surface-2 text-ink")}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  {busy && <Spinner label="Gia sư đang suy nghĩ…" />}
                </div>
                <div className="flex gap-2 border-t border-line p-3">
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
                    aria-label="Câu hỏi gửi gia sư"
                    placeholder="Em muốn hỏi gì?" className="flex-1 rounded-md border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand" />
                  <button onClick={() => ask()} disabled={busy || !input.trim()} aria-label="Gửi"
                    className="rounded-md bg-brand px-3.5 text-on-brand transition hover:bg-brand-ink disabled:opacity-45"><Send size={16} /></button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
