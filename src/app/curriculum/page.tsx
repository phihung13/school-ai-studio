"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  FolderTree, Plus, Pencil, Trash2, Paperclip, ChevronRight,
  HardDrive, BookOpen, Film, Link as LinkIcon, ExternalLink, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getData, api, Card, Button, PageLoading, LoadError, Empty, Modal, Spinner, useToast, cls } from "@/components/ui";
import { TreeNode, Reference } from "@/lib/shared";

// ===== dữ liệu =====
interface CurriculumData {
  subjects: TreeNode[];
  subjectId: string;
  nodes: TreeNode[];
  pkgCount: Record<string, number>;
}

// ===== hằng số theo cấp =====
type Kind = TreeNode["kind"];
const CHILD_KIND: Record<Kind, Kind | null> = {
  subject: "grade", grade: "chapter", chapter: "lesson", lesson: "point", point: "atom", atom: null,
};
const KIND_LABEL: Record<Kind, string> = {
  subject: "môn", grade: "lớp", chapter: "chương", lesson: "bài", point: "điểm KT", atom: "nguyên tử",
};
// nhãn cho hành động "thêm con" dùng nhãn của cấp con
const ADD_CHILD_LABEL: Record<Kind, string> = {
  subject: "lớp", grade: "chương", chapter: "bài", lesson: "điểm KT", point: "nguyên tử", atom: "",
};

type RefKind = Reference["kind"];
const REF_KIND_LABEL: Record<RefKind, string> = {
  drive: "Google Drive", sgk: "SGK", video: "Video", link: "Đường dẫn",
};
function RefIcon({ kind, size = 16, className }: { kind: RefKind; size?: number; className?: string }) {
  const I = kind === "drive" ? HardDrive : kind === "sgk" ? BookOpen : kind === "video" ? Film : LinkIcon;
  return <I size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

// ===== trạng thái modal =====
type NameModal =
  | { mode: "add"; parent: TreeNode | null; kind: Kind }
  | { mode: "edit"; node: TreeNode }
  | null;

export function CurriculumPanel() {
  const [data, setData] = useState<CurriculumData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nameModal, setNameModal] = useState<NameModal>(null);
  const [refNode, setRefNode] = useState<TreeNode | null>(null);
  const [toast, show] = useToast();

  const load = React.useCallback(async (sid?: string) => {
    setErr(null);
    try {
      const d = await getData<CurriculumData>("curriculum", sid ? { id: sid } : {});
      setData(d);
      setSubjectId(d.subjectId);
      // mở sẵn môn đang chọn để thấy chương ngay
      setExpanded((prev) => (prev.size ? prev : new Set([d.subjectId])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tải được dữ liệu");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // đồng bộ node đang mở panel tài liệu với dữ liệu mới sau refresh
  const refNodeLive = useMemo(
    () => (refNode ? data?.nodes.find((n) => n.id === refNode.id) ?? null : null),
    [refNode, data],
  );

  if (err) return <LoadError msg={err} backHref="/" />;
  if (!data) return <PageLoading />;

  const { subjects, nodes, pkgCount } = data;
  // gom con theo parentId, giữ thứ tự order
  const childrenOf = (pid: string | null) =>
    nodes.filter((n) => n.parentId === pid).sort((a, b) => a.order - b.order);
  const subjectRoot = nodes.find((n) => n.id === subjectId && n.kind === "subject") || null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const onSubjectChange = (sid: string) => {
    setSubjectId(sid);
    setExpanded(new Set([sid]));
    load(sid);
  };

  // ==== thao tác API ====
  const refresh = () => load(subjectId);

  const doDelete = async (n: TreeNode) => {
    const kindLabel = KIND_LABEL[n.kind];
    if (!window.confirm(`Xoá ${kindLabel} “${n.title}”?\n\nSẽ xoá cả các mục con và toàn bộ học liệu (gói, asset) bên trong. Không thể hoàn tác.`)) return;
    try {
      await api("nodeDelete", { id: n.id });
      show(`Đã xoá ${kindLabel} “${n.title}”`);
      await refresh();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi khi xoá", "err"); }
  };

  return (
    <>
      {toast}
      <div className="fade-up">
        {/* ===== Header ===== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
              <FolderTree size={26} strokeWidth={1.75} aria-hidden className="text-brand" />
              Quản lý chương trình
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              Xây cây kiến thức và gắn tài liệu tham khảo.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="subject-select">Chọn môn</label>
            <select
              id="subject-select"
              value={subjectId}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <Button onClick={() => setNameModal({ mode: "add", parent: null, kind: "subject" })}>
              <Plus size={16} strokeWidth={2} aria-hidden /> Thêm môn
            </Button>
          </div>
        </div>

        {/* ===== Cây ===== */}
        <Card className="mt-6 p-2 sm:p-3">
          {subjects.length === 0 ? (
            <Empty
              icon={<FolderTree size={30} strokeWidth={1.5} />}
              title="Chưa có môn nào"
              hint="Bấm “＋ Thêm môn” để tạo môn học đầu tiên, rồi dựng dần lớp → chương → bài → điểm kiến thức → nguyên tử."
            />
          ) : !subjectRoot ? (
            <Empty icon={<FolderTree size={30} strokeWidth={1.5} />} title="Không tìm thấy môn đang chọn" hint="Chọn một môn khác ở trên." />
          ) : (
            <ul className="space-y-0.5">
              <TreeRow
                node={subjectRoot}
                depth={0}
                pkgCount={pkgCount}
                expanded={expanded}
                childrenOf={childrenOf}
                onToggle={toggle}
                onAddChild={(parent, kind) => setNameModal({ mode: "add", parent, kind })}
                onEdit={(node) => setNameModal({ mode: "edit", node })}
                onDelete={doDelete}
                onOpenRefs={setRefNode}
              />
            </ul>
          )}
        </Card>
      </div>

      {/* ===== Modal thêm/sửa tên ===== */}
      <NameModalView
        state={nameModal}
        onClose={() => setNameModal(null)}
        onDone={async (msg) => { setNameModal(null); show(msg); await refresh(); }}
        onError={(m) => show(m, "err")}
      />

      {/* ===== Modal tài liệu tham khảo ===== */}
      <RefsModal
        node={refNodeLive}
        onClose={() => setRefNode(null)}
        onChanged={refresh}
        onToast={show}
      />
    </>
  );
}

// Route cũ /curriculum → chuyển vào tab trong trang Cài đặt
export default function CurriculumRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?tab=curriculum"); }, [router]);
  return null;
}

// ===== 1 hàng cây (đệ quy) =====
function TreeRow({
  node, depth, pkgCount, expanded, childrenOf, onToggle, onAddChild, onEdit, onDelete, onOpenRefs,
}: {
  node: TreeNode;
  depth: number;
  pkgCount: Record<string, number>;
  expanded: Set<string>;
  childrenOf: (pid: string | null) => TreeNode[];
  onToggle: (id: string) => void;
  onAddChild: (parent: TreeNode, kind: TreeNode["kind"]) => void;
  onEdit: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onOpenRefs: (node: TreeNode) => void;
}) {
  const kids = childrenOf(node.id);
  const isAtom = node.kind === "atom";
  const canExpand = !isAtom;
  const open = expanded.has(node.id);
  const childKind = CHILD_KIND[node.kind];
  const refCount = node.refs?.length ?? 0;

  return (
    <li>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* mũi tên mở/đóng */}
        {canExpand ? (
          <button
            onClick={() => onToggle(node.id)}
            aria-label={open ? "Thu gọn" : "Mở rộng"}
            aria-expanded={open}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-line hover:text-ink"
          >
            <ChevronRight size={16} className={cls("transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          </span>
        )}

        {/* tên + mã */}
        <button
          onClick={() => canExpand && onToggle(node.id)}
          className={cls("flex min-w-0 flex-1 items-baseline gap-2 text-left", canExpand ? "cursor-pointer" : "cursor-default")}
        >
          <span className={cls("truncate text-sm text-ink", node.kind === "subject" && "font-semibold")}>{node.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted">{node.code}</span>
        </button>

        {/* số con / số gói */}
        <span className="shrink-0 text-[11px] text-muted">
          {isAtom
            ? `${pkgCount[node.id] ?? 0} gói`
            : kids.length > 0
              ? `${kids.length} ${childKind ? KIND_LABEL[childKind] : ""}`
              : "—"}
        </span>

        {/* chip tài liệu */}
        <button
          onClick={() => onOpenRefs(node)}
          title="Tài liệu tham khảo"
          className={cls(
            "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition",
            refCount > 0
              ? "border-brand-line bg-brand-bg text-brand-ink hover:bg-brand-bg/70"
              : "border-line bg-surface text-muted opacity-0 hover:border-line-strong hover:text-ink-2 group-hover:opacity-100",
          )}
        >
          <Paperclip size={12} strokeWidth={2} aria-hidden /> {refCount}
        </button>

        {/* nút thao tác — hiện khi hover */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {childKind && (
            <button
              onClick={() => onAddChild(node, childKind)}
              title={`Thêm ${ADD_CHILD_LABEL[node.kind]}`}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-brand transition hover:bg-brand-bg"
            >
              <Plus size={13} strokeWidth={2} aria-hidden /> {ADD_CHILD_LABEL[node.kind]}
            </button>
          )}
          <button
            onClick={() => onEdit(node)}
            title="Sửa tên"
            aria-label="Sửa tên"
            className="rounded-md p-1.5 text-muted transition hover:bg-line hover:text-ink"
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            onClick={() => onDelete(node)}
            title="Xoá"
            aria-label="Xoá"
            className="rounded-md p-1.5 text-muted transition hover:bg-danger-bg hover:text-danger"
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      {/* con */}
      {canExpand && open && (
        <ul className="space-y-0.5">
          {kids.length === 0 ? (
            <li
              className="py-1 text-xs italic text-muted"
              style={{ paddingLeft: `${(depth + 1) * 20 + 34}px` }}
            >
              Chưa có {childKind ? KIND_LABEL[childKind] : "mục con"}.{" "}
              {childKind && (
                <button onClick={() => onAddChild(node, childKind)} className="not-italic text-brand hover:underline">
                  Thêm {ADD_CHILD_LABEL[node.kind]}
                </button>
              )}
            </li>
          ) : (
            kids.map((c) => (
              <TreeRow
                key={c.id}
                node={c}
                depth={depth + 1}
                pkgCount={pkgCount}
                expanded={expanded}
                childrenOf={childrenOf}
                onToggle={onToggle}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpenRefs={onOpenRefs}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// ===== Modal thêm/sửa tên =====
function NameModalView({
  state, onClose, onDone, onError,
}: {
  state: NameModal;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    setTitle(state.mode === "edit" ? state.node.title : "");
    setBusy(false);
  }, [state]);

  if (!state) return null;

  const isEdit = state.mode === "edit";
  const kind: Kind = isEdit ? state.node.kind : state.kind;
  const parentTitle = !isEdit ? state.parent?.title : undefined;
  const label = KIND_LABEL[kind];
  const modalTitle = isEdit
    ? `Sửa tên ${label}`
    : kind === "subject"
      ? "Thêm môn mới"
      : `Thêm ${label}${parentTitle ? ` vào “${parentTitle}”` : ""}`;

  const submit = async () => {
    const t = title.trim();
    if (!t) { onError("Nhập tên"); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await api("nodeEdit", { id: state.node.id, title: t });
        await onDone(`Đã đổi tên thành “${t}”`);
      } else {
        await api("nodeCreate", { parentId: state.parent?.id ?? null, kind, title: t });
        await onDone(`Đã thêm ${label} “${t}”`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Lỗi");
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={modalTitle}>
      <div className="space-y-4">
        <div>
          <label htmlFor="node-title" className="mb-1.5 block text-sm font-medium text-ink">
            Tên {label}
          </label>
          <input
            id="node-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
            placeholder={`Nhập tên ${label}…`}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : isEdit ? "Lưu tên" : "Thêm"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ===== Modal tài liệu tham khảo =====
const REF_KINDS: RefKind[] = ["drive", "sgk", "video", "link"];

function RefsModal({
  node, onClose, onChanged, onToast,
}: {
  node: TreeNode | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onToast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<RefKind>("drive");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (node) { setTitle(""); setUrl(""); setKind("drive"); setBusy(false); }
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  const refs = node.refs ?? [];

  const add = async () => {
    const t = title.trim(); const u = url.trim();
    if (!t || !u) { onToast("Nhập tên và đường dẫn", "err"); return; }
    setBusy(true);
    try {
      await api("refAdd", { nodeId: node.id, title: t, url: u, kind });
      onToast("Đã gắn tài liệu");
      setTitle(""); setUrl(""); setKind("drive");
      await onChanged();
    } catch (e) { onToast(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  const remove = async (r: Reference) => {
    try {
      await api("refRemove", { nodeId: node.id, refId: r.id });
      onToast("Đã gỡ tài liệu");
      await onChanged();
    } catch (e) { onToast(e instanceof Error ? e.message : "Lỗi", "err"); }
  };

  return (
    <Modal open onClose={onClose} title={`Tài liệu tham khảo · ${node.title}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Gắn link Google Drive, sách giáo khoa, video hoặc đường dẫn khác cho <b className="text-ink-2">{KIND_LABEL[node.kind]}</b> này.
          <span className="ml-1 font-mono text-[11px]">{node.code}</span>
        </p>

        {/* danh sách refs */}
        {refs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">
            Chưa có tài liệu nào.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {refs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-bg text-brand-ink">
                  <RefIcon kind={r.kind} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.title}</p>
                  <p className="truncate text-[11px] text-muted">{REF_KIND_LABEL[r.kind]} · {r.url}</p>
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở đường dẫn"
                  aria-label="Mở đường dẫn"
                  className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-brand"
                >
                  <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
                </a>
                <button
                  onClick={() => remove(r)}
                  title="Gỡ tài liệu"
                  aria-label="Gỡ tài liệu"
                  className="rounded-md p-1.5 text-muted transition hover:bg-danger-bg hover:text-danger"
                >
                  <X size={15} strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* form thêm ref */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface-2/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Thêm tài liệu</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tên tài liệu (vd: SGK Toán 6 – tr.42)"
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) add(); }}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as RefKind)}
              aria-label="Loại tài liệu"
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
            >
              {REF_KINDS.map((k) => (
                <option key={k} value={k}>{REF_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <Button onClick={add} disabled={busy}>
              {busy ? <Spinner /> : <><Plus size={15} strokeWidth={2} aria-hidden /> Gắn tài liệu</>}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
