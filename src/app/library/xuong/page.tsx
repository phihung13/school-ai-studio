"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, PackageSearch, CheckSquare, Square, Download, FolderInput, Archive, ArchiveRestore, Trash2, Folder, X, GraduationCap, CheckCircle2, XCircle } from "lucide-react";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, AssetBadge, Empty, FormatIcon, timeAgo, cls, Button, Modal, Spinner, useToast, M } from "@/components/ui";
import { TreeNode, Pkg, Asset, User, AssetFormat, FORMAT_LABEL, LEVEL_LABEL, LEVEL_COLOR, STATUS_LABEL } from "@/lib/shared";

interface Item { asset: Asset; pkg: Pkg; atom: TreeNode; chain: string }
interface LibData { items: Item[]; formats: AssetFormat[]; folders: string[]; archivedCount: number }

export default function LibraryFactoryPage() {
  const [data, setData] = useState<LibData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const [fmt, setFmt] = useState("");
  const [folder, setFolder] = useState("");
  const [archived, setArchived] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [pushRes, setPushRes] = useState<{ id: string; code: string; format: AssetFormat; ok: boolean; msg: string }[] | null>(null);
  const [toast, show] = useToast();

  const load = useCallback(() => {
    getData<LibData>("library", { q, format: fmt, folder, archived: archived ? "1" : "" }).then(setData).catch(() => {});
  }, [q, fmt, folder, archived]);

  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const canEdit = me && me.role !== "principal";
  const ids = [...sel];
  const allVisible = data ? data.items.length > 0 && data.items.every((x) => sel.has(x.asset.id)) : false;

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allVisible ? new Set() : new Set(data!.items.map((x) => x.asset.id)));

  const bulk = async (action: "delete" | "archive" | "unarchive" | "folder", fname?: string) => {
    setBusy(action);
    try {
      const res = await api<{ affected: number }>("assetsBulk", { action, ids, folder: fname });
      const label = action === "delete" ? "Đã xóa" : action === "archive" ? "Đã lưu trữ" : action === "unarchive" ? "Đã bỏ lưu trữ" : fname ? `Đã chuyển vào thư mục “${fname}”` : "Đã bỏ khỏi thư mục";
      show(`${label} ${res.affected} học liệu`);
      setSel(new Set()); setFolderOpen(false); setConfirmDel(false);
      load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  // Đẩy sang app Gia sư: dựng file → upload bucket tutor → import-kg. Có thể lâu (podcast phải dựng MP3).
  const pushTutor = async () => {
    setBusy("push");
    try {
      const res = await api<{ pushed: number; results: { id: string; code: string; format: AssetFormat; ok: boolean; msg: string }[] }>("tutorPush", { ids });
      setPushRes(res.results);
      if (res.pushed > 0) { show(`Đã đẩy ${res.pushed}/${res.results.length} học liệu sang Gia sư`); setSel(new Set()); }
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(null);
  };

  return (
    <Shell user={me}>
      {toast}
      <div className="fade-up pb-24">
        <Link href="/library" className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-brand">‹ Về kho tài nguyên</Link>
        <h1 className="font-display text-2xl font-semibold text-ink">Học liệu cũ — xưởng AI Studio</h1>
        <p className="mt-1 text-sm text-ink-2">Bản nháp do xưởng Studio tự sinh trước đây. Kho chính thức hiện dùng <Link href="/library" className="text-brand underline-offset-2 hover:underline">tài nguyên NotebookLM</Link>; mục này giữ lại để tra cứu và đẩy sang app Gia sư.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên nguyên tử, mã, chương…" aria-label="Tìm học liệu theo tên nguyên tử, mã, chương"
              className="w-full rounded-md border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFmt("")} className={cls("rounded-full border px-3 py-1.5 text-xs font-medium transition", !fmt ? "border-brand bg-brand-bg text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>Tất cả</button>
            {(data?.formats || []).map((f) => (
              <button key={f} onClick={() => setFmt(fmt === f ? "" : f)}
                className={cls("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition", fmt === f ? "border-brand bg-brand-bg text-brand-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                <FormatIcon format={f} size={15} /> {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {/* thư mục + lưu trữ + chọn tất cả */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(data?.folders || []).map((f) => (
            <button key={f} onClick={() => setFolder(folder === f ? "" : f)}
              className={cls("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition", folder === f ? "border-brass bg-brass-bg text-brass-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
              <Folder size={13} aria-hidden /> {f}
            </button>
          ))}
          <button onClick={() => { setArchived(!archived); setSel(new Set()); }}
            className={cls("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition", archived ? "border-ink bg-surface-2 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
            <Archive size={13} aria-hidden /> Đã lưu trữ{data ? ` (${data.archivedCount})` : ""}
          </button>
          {data && data.items.length > 0 && (
            <button onClick={toggleAll} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-bg">
              {allVisible ? <CheckSquare size={15} aria-hidden /> : <Square size={15} aria-hidden />} Chọn tất cả ({data.items.length})
            </button>
          )}
        </div>

        {!data ? <PageLoading /> : data.items.length === 0 ? (
          <div className="mt-6"><Empty icon={<PackageSearch size={28} strokeWidth={1.75} />} title={archived ? "Chưa có học liệu lưu trữ" : "Chưa tìm thấy học liệu nào"} hint={archived ? "Chọn học liệu trong kho rồi bấm Lưu trữ để dọn gọn." : "Thử từ khóa khác, hoặc vào cây kiến thức để sinh học liệu mới."} /></div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map(({ asset, pkg, atom, chain }) => {
              const on = sel.has(asset.id);
              return (
                <Link key={asset.id} href={`/asset/${asset.id}`} className="relative">
                  <Card className={cls("h-full p-4 transition", on && "border-brand ring-1 ring-brand")} interactive>
                    <div className="flex items-center justify-between gap-2">
                      <FormatIcon format={asset.format} size={26} className="text-brand" />
                      <div className="flex items-center gap-1.5">
                        {asset.folder && <span className="inline-flex items-center gap-1 rounded-full bg-brass-bg px-2 py-0.5 text-[10px] font-medium text-brass-ink"><Folder size={10} aria-hidden />{asset.folder}</span>}
                        <AssetBadge status={asset.status} />
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 pr-6 text-sm font-semibold text-ink">{FORMAT_LABEL[asset.format]}: <M>{atom.title}</M></p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted"><M>{chain}</M></p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={cls("rounded-full px-2 py-0.5 font-semibold", LEVEL_COLOR[pkg.level])}>Mức {pkg.level} · {LEVEL_LABEL[pkg.level]}</span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">gói: {STATUS_LABEL[pkg.status]}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">{asset.createdBy} · {timeAgo(asset.createdAt)}</p>
                  </Card>
                  {/* ô chọn: chặn điều hướng của Link */}
                  <button aria-label={on ? "Bỏ chọn" : "Chọn"} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(asset.id); }}
                    className={cls("absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-md border transition",
                      on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface/95 text-muted hover:border-brand hover:text-brand")}>
                    {on ? <CheckSquare size={16} aria-hidden /> : <Square size={16} aria-hidden />}
                  </button>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* thanh thao tác hàng loạt */}
      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-2.5 shadow-lg backdrop-blur">
          <span className="text-sm font-semibold text-ink">{sel.size} đã chọn</span>
          <a href={`/api/export?ids=${ids.join(",")}`}>
            <Button variant="secondary"><Download size={15} aria-hidden />Tải ZIP</Button>
          </a>
          {canEdit && (
            <>
              <Button variant="secondary" onClick={pushTutor} disabled={!!busy}>{busy === "push" ? <Spinner label="Đang đẩy…" /> : <><GraduationCap size={15} aria-hidden />Đẩy sang Gia sư</>}</Button>
              <Button variant="secondary" onClick={() => { setFolderName(""); setFolderOpen(true); }}><FolderInput size={15} aria-hidden />Thư mục</Button>
              {archived
                ? <Button variant="secondary" onClick={() => bulk("unarchive")} disabled={!!busy}>{busy === "unarchive" ? <Spinner /> : <><ArchiveRestore size={15} aria-hidden />Bỏ lưu trữ</>}</Button>
                : <Button variant="secondary" onClick={() => bulk("archive")} disabled={!!busy}>{busy === "archive" ? <Spinner /> : <><Archive size={15} aria-hidden />Lưu trữ</>}</Button>}
              <Button variant="danger" onClick={() => setConfirmDel(true)} disabled={!!busy}><Trash2 size={15} aria-hidden />Xóa</Button>
            </>
          )}
          <button onClick={() => setSel(new Set())} aria-label="Bỏ chọn tất cả" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink"><X size={16} aria-hidden /></button>
        </div>
      )}

      <Modal open={folderOpen} onClose={() => setFolderOpen(false)} title={`Chuyển ${sel.size} học liệu vào thư mục`}>
        <div className="flex gap-2">
          <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Tên thư mục (mới hoặc có sẵn)…" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && folderName.trim()) bulk("folder", folderName.trim()); }}
            className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
          <Button onClick={() => bulk("folder", folderName.trim())} disabled={!folderName.trim() || !!busy}>{busy === "folder" ? <Spinner /> : "Chuyển"}</Button>
        </div>
        {(data?.folders || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data!.folders.map((f) => (
              <button key={f} onClick={() => bulk("folder", f)} disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition hover:border-brass hover:text-brass-ink">
                <Folder size={13} aria-hidden /> {f}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => bulk("folder", "")} disabled={!!busy} className="mt-3 text-xs text-muted underline-offset-2 hover:text-danger hover:underline">Bỏ các học liệu đã chọn khỏi thư mục hiện tại</button>
      </Modal>

      <Modal open={!!pushRes} onClose={() => setPushRes(null)} title="Kết quả đẩy sang Gia sư">
        {pushRes && (
          <>
            <p className="text-sm text-ink-2">
              {pushRes.filter((r) => r.ok).length}/{pushRes.length} học liệu đã sang app Gia sư — học sinh thấy ngay ở mục &ldquo;bài đặc biệt&rdquo; của nguyên tử tương ứng.
            </p>
            <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto scrollthin">
              {pushRes.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  {r.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />}
                  <span className="min-w-0 text-ink-2"><b className="text-ink">{r.code}</b> · {FORMAT_LABEL[r.format]} — {r.msg}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title={`Xóa ${sel.size} học liệu?`}>
        <p className="text-sm text-ink-2">Hành động này <b>không hoàn tác được</b>. Gói tri thức gốc vẫn còn — có thể sinh lại học liệu bất cứ lúc nào. Nếu chỉ muốn dọn gọn kho, hãy dùng <b>Lưu trữ</b>.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDel(false)} disabled={!!busy}>Hủy</Button>
          <Button variant="danger" onClick={() => bulk("delete")} disabled={!!busy}>{busy === "delete" ? <Spinner /> : <><Trash2 size={15} aria-hidden />Xóa vĩnh viễn</>}</Button>
        </div>
      </Modal>
    </Shell>
  );
}
