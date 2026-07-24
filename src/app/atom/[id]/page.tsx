"use client";
import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wand2, Plus, FolderOpen, Eye, FolderOpen as DriveIcon, BookOpen, Film, Link as LinkIcon, ExternalLink, Cog, Network, ArrowRight, Download, Play, type LucideIcon } from "lucide-react";
import Shell, { Breadcrumb } from "@/components/shell";
import { getData, api, Card, PageLoading, LoadError, Button, StatusBadge, AssetBadge, Spinner, Modal, useToast, cls, FormatIcon, M } from "@/components/ui";
import { TreeNode, Pkg, Asset, AssetFormat, Reference, User, OutlineNode, Question, FORMAT_LABEL, LEVEL_LABEL, LEVEL_COLOR, ATOM_TYPE_LABEL, ATOM_TYPE_COLOR, readableMath } from "@/lib/shared";
import TreeMindmap from "@/components/tree-mindmap";

type RefKind = Reference["kind"];
interface AtomRef extends Reference { from: string }

interface AtomData {
  atom: TreeNode; ancestors: TreeNode[]; packages: (Pkg | null)[]; assets: Asset[]; formats: AssetFormat[]; siblings: TreeNode[];
  refs?: AtomRef[]; outline?: OutlineNode; outlineRoot?: string; questions?: Question[];
}

const REF_ICON: Record<RefKind, LucideIcon> = { drive: DriveIcon, sgk: BookOpen, video: Film, link: LinkIcon };
const REF_KIND_LABEL: Record<RefKind, string> = { drive: "Google Drive", sgk: "Sách giáo khoa", video: "Video", link: "Liên kết" };

export default function AtomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AtomData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, show] = useToast();
  const [refOpen, setRefOpen] = useState(false);
  const [refForm, setRefForm] = useState<{ title: string; url: string; kind: RefKind }>({ title: "", url: "", kind: "link" });
  const [refBusy, setRefBusy] = useState(false);
  const [lvl, setLvl] = useState(1);   // mức đang chọn — học liệu ở Bước 2 luôn thuộc về mức này

  const load = useCallback(() => {
    getData<AtomData>("atom", { id }).then(setData).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    load();
  }, [load]);

  if (err) return <Shell user={me}><LoadError msg={err} backHref="/tree" backLabel="Về cây kiến thức" /></Shell>;
  if (!data) return <Shell user={me}><PageLoading /></Shell>;
  const { atom, packages, assets, formats } = data;
  const refs = data.refs || [];
  const questions = data.questions || [];
  const canEdit = me && me.role !== "principal";
  const pkg = packages[lvl - 1];

  const addRef = async () => {
    if (!refForm.title.trim() || !refForm.url.trim()) { show("Nhập tên và đường dẫn", "err"); return; }
    setRefBusy(true);
    try {
      await api("refAdd", { nodeId: atom.id, title: refForm.title, url: refForm.url, kind: refForm.kind });
      show("Đã thêm tài liệu tham khảo");
      setRefOpen(false);
      setRefForm({ title: "", url: "", kind: "link" });
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setRefBusy(false);
  };

  const draft = async (level: 1 | 2 | 3) => {
    setBusy(`draft-${level}`);
    try {
      await api("draftPackage", { atomId: atom.id, level });
      show(`Đã nháp gói mức ${level} bằng AI — mời giáo viên rà soát`);
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  const generate = async (pkgId: string, format: AssetFormat) => {
    setBusy(`${pkgId}-${format}`);
    try {
      await api<{ asset: Asset }>("generateAsset", { pkgId, format });
      show(`Đã sinh ${FORMAT_LABEL[format]} — bấm ô để mở, hoặc sinh tiếp định dạng khác`);
      load();  // Ở LẠI ma trận, hiện ô vừa sinh → cho phép sinh tiếp định dạng khác (không nhảy đi)
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up">
        <Breadcrumb items={[{ label: "Cây kiến thức", href: "/tree" }, ...data.ancestors.map((a) => ({ label: a.title, href: a.kind === "subject" ? `/tree?subject=${a.id}` : a.kind === "grade" ? `/tree?node=${a.id}` : undefined })), { label: atom.title }]} />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink"><M>{atom.title}</M></h1>
          <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-muted">{atom.code}</span>
          {/* lăng kính còn lại của CHÍNH nguyên tử này (không phải một việc khác) */}
          <Link href={`/graph?node=${atom.id}`} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-brand">
            <Network size={14} /> Xem trên đồ thị
          </Link>
        </div>

        {/* Trang nguyên tử là NHÀ của nguyên tử → phải đủ thông tin ít nhất bằng panel đồ thị,
            không thể nghèo hơn lăng kính phụ. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {atom.atomType && <span className={cls("rounded-full px-2.5 py-0.5 text-[11px] font-medium", ATOM_TYPE_COLOR[atom.atomType])}>{ATOM_TYPE_LABEL[atom.atomType]}</span>}
          {atom.bloom && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">{atom.bloom}</span>}
          {atom.dok != null && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">DOK {atom.dok}</span>}
          <span className={cls("rounded-full px-2.5 py-0.5 text-[11px] font-medium", atom.verified ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>{atom.verified ? "✓ đã thẩm định" : "nháp"}</span>
          {atom.nangLuc && <span className="text-[11px] text-muted">Năng lực: <b className="font-medium text-ink-2"><M>{atom.nangLuc}</M></b></span>}
        </div>

        {atom.yeuCau && (
          <div className="mt-4 rounded-xl border border-brand-line/60 bg-brand-bg/40 px-4 py-3">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">Yêu cầu cần đạt</p>
            <p className="text-sm text-ink-2"><M>{atom.yeuCau}</M></p>
          </div>
        )}

        {atom.quanNiemSai && (
          <div className="mt-3 rounded-xl border border-warn-line bg-warn-bg/50 px-4 py-3">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn">Quan niệm sai điển hình</p>
            <p className="text-sm text-ink-2"><M>{atom.quanNiemSai}</M></p>
          </div>
        )}

        {/* ══ SẢN XUẤT: MỘT luồng duy nhất — chọn mức → bước 1 nháp gói → bước 2 sinh học liệu ══
            (trước đây là 3 thẻ mức RỜI + ma trận định dạng × mức: hai chỗ cùng làm một việc, người dùng
             không biết bắt đầu ở đâu. Nay học liệu luôn thuộc về MỘT mức đang chọn.) */}
        <h2 className="mb-1 mt-8 font-display text-lg font-semibold text-ink">Sản xuất học liệu cho nguyên tử này</h2>
        <p className="mb-3 text-sm text-ink-2">Chọn mức độ, nháp gói tri thức, rồi sinh học liệu từ gói đó.</p>

        <Card className="p-4">
          {/* chọn mức */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[1, 2, 3].map((lv) => {
              const has = !!packages[lv - 1];
              return (
                <button key={lv} onClick={() => setLvl(lv)}
                  className={cls("rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                    lv === lvl ? LEVEL_COLOR[lv] : "bg-surface-2 text-muted hover:text-ink-2")}>
                  Mức {lv} · {LEVEL_LABEL[lv]}
                  <span className={cls("ml-1.5 text-[10px] font-normal", lv === lvl ? "opacity-70" : "text-line-strong")}>{has ? "✓" : "—"}</span>
                </button>
              );
            })}
          </div>

          {/* BƯỚC 1 — gói tri thức của mức đang chọn */}
          <div className="mt-4 rounded-xl border border-line bg-surface-2/40 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">Bước 1</span>
              <span className="text-sm font-medium text-ink">Gói tri thức</span>
              {pkg && <StatusBadge status={pkg.status} />}
              {pkg && <span className="text-[11px] text-muted">v{pkg.version} · {pkg.updatedBy}</span>}
              <span className="ml-auto flex items-center gap-2">
                {pkg ? (
                  <>
                    {canEdit && pkg.status !== "approved" && (
                      <Button variant="secondary" disabled={!!busy}
                        onClick={() => { if (window.confirm("Sinh lại gói mức này bằng AI? Nội dung nháp hiện tại sẽ bị GHI ĐÈ, và học liệu đã sinh từ gói này sẽ bị đánh dấu 'cần cập nhật'.")) draft(lvl as 1 | 2 | 3); }}>
                        {busy === `draft-${lvl}` ? <Spinner label="AI đang nháp…" /> : <><Wand2 size={15} /> Sinh lại</>}
                      </Button>
                    )}
                    <Link href={`/package/${pkg.id}`}>
                      <Button variant="secondary">{canEdit ? <><FolderOpen size={15} /> Mở gói</> : <><Eye size={15} /> Xem gói</>}</Button>
                    </Link>
                  </>
                ) : canEdit ? (
                  <Button variant="primary" disabled={!!busy} onClick={() => draft(lvl as 1 | 2 | 3)}>
                    {busy === `draft-${lvl}` ? <Spinner label="AI đang nháp…" /> : <><Wand2 size={15} /> Nháp bằng AI</>}
                  </Button>
                ) : null}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              {pkg ? <M>{pkg.fields.objective}</M> : <span className="text-muted">Chưa có gói tri thức cho mức này — nháp gói trước, học liệu sinh ra từ nó.</span>}
            </p>
          </div>

          {/* BƯỚC 2 — học liệu sinh từ gói của MỨC đang chọn */}
          <div className={cls("mt-3 rounded-xl border border-line p-3.5 transition", pkg ? "bg-surface-2/40" : "bg-surface-2/20 opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cls("rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white", pkg ? "bg-ink" : "bg-line-strong")}>Bước 2</span>
              <span className="text-sm font-medium text-ink">Học liệu</span>
              <span className="text-[11px] text-muted">{pkg ? "Bấm ô đã có để mở · ô trống để sinh" : "Cần gói tri thức ở Bước 1 trước"}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {formats.map((f) => {
                const asset = pkg ? assets.find((a) => a.packageId === pkg.id && a.format === f) : undefined;
                const key = pkg ? `${pkg.id}-${f}` : "";
                const inner = (
                  <>
                    <FormatIcon format={f} size={16} className="shrink-0 text-brass-ink" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{FORMAT_LABEL[f]}</span>
                  </>
                );
                if (asset) {
                  const openHref = `/asset/${asset.id}`;
                  const dl = `/api/export?assetId=${asset.id}`;               // biến thể mặc định theo định dạng
                  const act = "flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-ink-2 transition hover:border-brand hover:bg-brand-bg/40 hover:text-brand";
                  return (
                    <div key={f} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 transition hover:border-brand/60">
                      <Link href={openHref} className="flex min-w-0 flex-1 items-center gap-2">{inner}</Link>
                      {/* gói cũ (outdated) vẫn hiện cảnh báo; gói "Sẵn sàng" thay chữ bằng NÚT hành động ngay tại ô */}
                      {asset.status !== "ready" && <AssetBadge status={asset.status} />}
                      {f === "slide" ? (
                        // slide: mở trang để CHỌN MẪU + xem trước realtime (không tải trực tiếp vì cần chọn mẫu)
                        <Link href={openHref} className={act} title="Mở để chọn mẫu & xem trước"><Eye size={13} strokeWidth={2} /> Mở</Link>
                      ) : f === "podcast" ? (
                        // podcast: ▶ nghe (mở trang có trình phát + hội thoại) + tải kịch bản (Word)
                        <>
                          <Link href={openHref} className={act} title="Nghe & xem hội thoại chi tiết"><Play size={13} strokeWidth={2} /> Nghe</Link>
                          <a href={dl} className={act} title="Tải kịch bản (Word)"><Download size={13} strokeWidth={2} /></a>
                        </>
                      ) : (
                        // tài liệu (bài đọc/phiếu/mindmap/quiz/flashcard): tải thẳng, không cần mở trang
                        <a href={dl} className={act} title={`Tải ${FORMAT_LABEL[f]}`}><Download size={13} strokeWidth={2} /> Tải</a>
                      )}
                    </div>
                  );
                }
                return (
                  <button key={f} disabled={!pkg || !canEdit || !!busy} onClick={() => pkg && generate(pkg.id, f)}
                    className={cls("flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left transition",
                      busy === key ? "border-brand bg-brand-bg" : "border-line-strong hover:border-brand hover:bg-brand-bg/30 disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:bg-transparent")}>
                    {inner}
                    <span className="shrink-0 text-xs text-muted">{busy === key ? <Spinner label="Đang tạo…" /> : <><Plus size={13} className="inline" /> Sinh</>}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* đường sang HÀNG LOẠT — nói rõ đây là cấp trên của việc đang làm, không phải việc khác */}
          <Link href={`/batch?subject=${data.ancestors[0]?.id || ""}&node=${atom.id}`}
            className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-xs text-muted transition hover:border-brand hover:text-brand-ink">
            <Cog size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">Cần làm cho <b className="text-ink-2">cả cụm / cả chương</b> chứ không riêng nguyên tử này? Mở <b className="text-ink-2">Xưởng sản xuất</b> với phạm vi chọn sẵn</span>
            <ArrowRight size={14} className="shrink-0" />
          </Link>
        </Card>

        {data.outline && (
          <>
            <h2 className="mb-1 mt-9 font-display text-lg font-semibold text-ink">Sơ đồ vị trí trong {data.outlineRoot ? `"${data.outlineRoot}"` : "chương"}</h2>
            <p className="mb-3 text-sm text-ink-2">Dựng thẳng từ cây kiến thức thật — nguyên tử này in đậm.</p>
            <Card className="p-3">
              <TreeMindmap outline={data.outline} highlightId={atom.id} />
            </Card>
          </>
        )}

        {questions.length > 0 && (
          <>
            <h2 className="mb-1 mt-9 font-display text-lg font-semibold text-ink">Ngân hàng câu hỏi ({questions.length})</h2>
            <p className="mb-3 text-sm text-ink-2">Câu hỏi do kho biên soạn cho chính nguyên tử này — mỗi phương án nhiễu kèm lý do sai.</p>
            <Card className="divide-y divide-line">
              {questions.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm text-ink"><M>{q.noiDung}</M></p>
                    {q.doKho && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{q.doKho}</span>}
                    {q.dok != null && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">DOK {q.dok}</span>}
                  </div>
                  {q.dapAn && <p className="mt-1.5 text-sm text-ok">✓ <span className="text-ink-2"><M>{q.dapAn}</M></span></p>}
                  {(q.nhieu || []).length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {q.nhieu!.map((n, i) => (
                        <li key={i} className="text-[13px] text-muted">
                          <M>{n.noiDung}</M>
                          {n.lyDo && <span className="text-warn"> — {n.lyDo}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Card>
          </>
        )}

        <div className="mb-3 mt-9 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Tài liệu tham khảo</h2>
          {canEdit && <Button variant="secondary" onClick={() => setRefOpen(true)}><Plus size={15} /> Thêm tài liệu</Button>}
        </div>
        {refs.length === 0 ? (
          <p className="text-sm text-muted">Chưa có tài liệu — thêm ở Quản lý chương trình{canEdit ? " hoặc bấm “＋ Thêm tài liệu”." : "."}</p>
        ) : (
          <Card className="divide-y divide-line">
            {refs.map((r) => {
              const Icon = REF_ICON[r.kind] || LinkIcon;
              return (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-bg text-brand"><Icon size={18} strokeWidth={1.75} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-ink">{r.title}</span>
                    <span className="block truncate text-[11px] text-muted">{REF_KIND_LABEL[r.kind]} · từ: {r.from}</span>
                  </span>
                  <ExternalLink size={15} className="shrink-0 text-muted transition group-hover:text-brand" />
                </a>
              );
            })}
          </Card>
        )}

        {data.siblings.length > 1 && (
          <>
            <h2 className="mb-3 mt-9 font-display text-lg font-semibold text-ink">Nguyên tử cùng điểm kiến thức</h2>
            <div className="flex flex-wrap gap-2">
              {data.siblings.filter((s) => s.id !== atom.id).map((s) => (
                <Link key={s.id} href={`/atom/${s.id}`} className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2 transition hover:border-brand hover:text-brand-ink">
                  <M>{s.title}</M>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={refOpen} onClose={() => setRefOpen(false)} title="Thêm tài liệu tham khảo">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-2">Tên tài liệu</span>
            <input value={refForm.title} onChange={(e) => setRefForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="VD: SGK Toán 6 — trang 24"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-2">Đường dẫn</span>
            <input value={refForm.url} onChange={(e) => setRefForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://…"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-2">Loại</span>
            <select value={refForm.kind} onChange={(e) => setRefForm((f) => ({ ...f, kind: e.target.value as RefKind }))}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30">
              {(Object.keys(REF_KIND_LABEL) as RefKind[]).map((k) => <option key={k} value={k}>{REF_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setRefOpen(false)}>Huỷ</Button>
            <Button onClick={addRef} disabled={refBusy}>{refBusy ? <Spinner label="Đang thêm…" /> : <><Plus size={15} /> Thêm</>}</Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
