"use client";
import React from "react";
import Link from "next/link";
import { ChevronRight, Network, ListTree } from "lucide-react";
import { cls } from "./ui";
import { readableMath } from "@/lib/shared";
import type { TMNode } from "./mindtree";

// Header CHUNG cho cả Cây và Đồ thị: breadcrumb (bộ lọc) + nút chuyển ống kính GIỮ NGUYÊN ngữ cảnh (?node).
export default function ExplorerHeader({ nodes, focusId, lens }: {
  nodes: TMNode[]; focusId: string | null; lens: "tree" | "graph";
}) {
  const byId: Record<string, TMNode> = {};
  for (const n of nodes) byId[n.id] = n;
  const focus = focusId ? byId[focusId] : null;
  const path: TMNode[] = [];
  { let cur: TMNode | null = focus; while (cur) { path.unshift(cur); cur = cur.parentId ? byId[cur.parentId] || null : null; } }
  const base = lens === "tree" ? "/tree" : "/graph";
  const href = (id: string | null) => (id ? `${base}?node=${id}` : base);
  const q = focusId ? `?node=${focusId}` : "";

  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1.5">
      <h1 className="mr-1 font-display text-xl font-semibold text-ink">{lens === "tree" ? "Cây kiến thức" : "Đồ thị tri thức"}</h1>

      <div className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0.5">
        <Link href={href(null)} className={cls("rounded-full px-2.5 py-1 text-sm transition", !focus ? "bg-brand-bg font-medium text-brand-ink" : "text-ink-2 hover:bg-surface-2")}>Tất cả môn</Link>
        {path.map((p) => (
          <React.Fragment key={p.id}>
            <ChevronRight size={14} className="shrink-0 text-line-strong" />
            <Link href={href(p.id)} className={cls("max-w-[16rem] truncate rounded-full px-2.5 py-1 text-sm transition", p.id === focusId ? "bg-brand-bg font-medium text-brand-ink" : "text-ink-2 hover:bg-surface-2")}>{readableMath(p.title)}</Link>
          </React.Fragment>
        ))}
      </div>

      <div className="ml-auto inline-flex shrink-0 rounded-md border border-line-strong bg-surface p-0.5">
        {lens === "tree"
          ? <span className="inline-flex items-center gap-1.5 rounded bg-brand px-2.5 py-1.5 text-xs font-medium text-on-brand"><Network size={14} />Sơ đồ cây</span>
          : <Link href={`/tree${q}`} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-surface-2"><Network size={14} />Sơ đồ cây</Link>}
        {lens === "graph"
          ? <span className="inline-flex items-center gap-1.5 rounded bg-brand px-2.5 py-1.5 text-xs font-medium text-on-brand"><ListTree size={14} />Đồ thị</span>
          : <Link href={`/graph${q}`} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-surface-2"><ListTree size={14} />Đồ thị</Link>}
      </div>
    </div>
  );
}
