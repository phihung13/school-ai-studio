"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Shell from "@/components/shell";
import { getData, PageLoading } from "@/components/ui";
import MindTree, { TMNode } from "@/components/mindtree";
import ExplorerHeader from "@/components/explorer-header";
import { User } from "@/lib/shared";

function TreeInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [nodes, setNodes] = useState<TMNode[] | null>(null);
  const focusParam = params.get("node") || null;
  const [focusId, setFocusId] = useState<string | null>(focusParam);
  useEffect(() => { setFocusId(focusParam); }, [focusParam]);
  useEffect(() => { getData<{ nodes: TMNode[] }>("treemap").then((d) => setNodes(d.nodes)).catch(() => {}); }, []);

  if (!nodes) return <PageLoading />;

  return (
    <div className="fade-up flex h-[calc(100dvh-3.25rem)] flex-col overflow-hidden px-3 pt-2 lg:h-[calc(100dvh-1.5rem)] lg:px-6 lg:pt-3">
      <ExplorerHeader nodes={nodes} focusId={focusId} lens="tree" />
      <div className="min-h-0 flex-1">
        <MindTree nodes={nodes} initialFocus={focusId}
          onPickAtom={(id) => router.push(`/graph?node=${id}`)}
          onNavigate={(id) => { setFocusId(id); router.replace(id ? `/tree?node=${id}` : "/tree"); }} />
      </div>
    </div>
  );
}

export default function TreePage() {
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  return (
    <Shell user={me}>
      <Suspense fallback={<PageLoading />}><TreeInner /></Suspense>
    </Shell>
  );
}
