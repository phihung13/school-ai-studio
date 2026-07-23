"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Waypoints, TreePine, Grid3x3, Atom, Share2 } from "lucide-react";
import Shell from "@/components/shell";
import { getData, PageLoading, Card } from "@/components/ui";
import { User, Cover3, COVER3_LABEL, COVER3_HEX } from "@/lib/shared";

interface GradeCell { id: string; grade: number | null; cover: Cover3; atoms: number; edges: number; verified: number }
interface SubjRow { id: string; title: string; grades: GradeCell[]; atoms: number; edges: number; cover: Cover3 }
interface MapData { subjects: SubjRow[]; gradeCols: number[]; totals: { subjects: number; withData: number; atoms: number; edges: number; greenCells: number } }

function Tile({ cell }: { cell: GradeCell | null }) {
  if (!cell || cell.cover === "empty") {
    return (
      <div className="flex h-14 w-full flex-col items-center justify-center rounded-lg border border-dashed border-line"
        title={cell ? "Có node lớp nhưng chưa có nguyên tử" : "Chưa phân rã"} style={{ background: COVER3_HEX.empty + "0c" }}>
        <span className="text-lg leading-none" style={{ color: COVER3_HEX.empty, opacity: 0.45 }}>·</span>
      </div>
    );
  }
  const hex = COVER3_HEX[cell.cover];
  const href = cell.cover === "full" ? `/graph?node=${cell.id}` : `/tree?node=${cell.id}`;
  return (
    <Link href={href} title={`${cell.atoms} nguyên tử · ${cell.edges} cạnh · ${cell.verified} đã thẩm định — ${COVER3_LABEL[cell.cover]}`}
      className="flex h-14 w-full flex-col items-center justify-center rounded-lg border transition hover:shadow-md"
      style={{ background: hex + "1c", borderColor: hex + "88" }}>
      <span className="font-display text-base font-bold leading-none" style={{ color: hex }}>{cell.atoms}</span>
      <span className="mt-0.5 flex items-center gap-0.5 text-[10px]" style={{ color: hex }}>
        {cell.cover === "full" ? <><Share2 size={9} strokeWidth={2.5} />đồ thị</> : "nguyên tử"}
      </span>
    </Link>
  );
}

export default function HomePage() {
  const [me, setMe] = useState<User | null>(null);
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    getData<MapData>("map").then(setData).catch(() => {});
  }, []);
  if (!data) return <Shell user={me}><PageLoading /></Shell>;

  const t = data.totals;
  const GRADES = Array.from({ length: 12 }, (_, i) => i + 1); // luôn hiện Lớp 1–12, thiếu data thì ô trống
  const stat = [
    { icon: Atom, label: "Nguyên tử đã nạp", value: t.atoms.toLocaleString("vi-VN"), tone: "text-brand" },
    { icon: Share2, label: "Cạnh nối tri thức", value: t.edges.toLocaleString("vi-VN"), tone: "text-info" },
    { icon: Grid3x3, label: "Môn có dữ liệu", value: `${t.withData}/${t.subjects}`, tone: "text-brass-ink" },
    { icon: Waypoints, label: "Ô sẵn đồ thị", value: String(t.greenCells), tone: "text-ok" },
  ];

  return (
    <Shell user={me}>
      <div className="fade-up">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Bản đồ tri thức</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">Rừng học liệu của trường — mỗi ô là một <b>Môn × Lớp</b>. Màu cho biết mức độ sẵn sàng; bấm ô để mở cây / đồ thị và sản xuất.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/tree" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-brand"><TreePine size={16} className="text-brand" />Cây</Link>
            <Link href="/graph" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-on-brand transition hover:opacity-90"><Waypoints size={16} />Đồ thị</Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat.map((s) => (
            <Card key={s.label} className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted"><s.icon size={15} strokeWidth={1.75} className={s.tone} aria-hidden />{s.label}</div>
              <p className="mt-1 font-display text-3xl font-semibold text-ink">{s.value}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Độ phủ theo Môn × Lớp</h2>
          <div className="flex items-center gap-3 text-xs">
            {(["full", "partial", "empty"] as Cover3[]).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: COVER3_HEX[c] }} />{COVER3_LABEL[c]}</span>
            ))}
          </div>
        </div>

        <Card className="overflow-x-auto p-3">
          <table className="w-full min-w-[880px] table-fixed border-separate" style={{ borderSpacing: "6px" }}>
            <colgroup><col style={{ width: "150px" }} />{GRADES.map((g) => <col key={g} />)}</colgroup>
            <thead>
              <tr>
                <th className="px-2 text-left"></th>
                {GRADES.map((g) => <th key={g} className="px-1 text-center text-xs font-semibold text-ink-2">Lớp {g}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.id}>
                  <td className="px-2 text-sm font-medium text-ink">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COVER3_HEX[s.cover] }} /><span className="leading-tight">{s.title}</span></span>
                  </td>
                  {GRADES.map((col) => {
                    const cell = s.grades.find((g) => g.grade === col) || null;
                    return <td key={col}><Tile cell={cell} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-3 text-xs text-muted">Ô 🟢 mở thẳng <b>đồ thị</b> (có cạnh nối) · ô 🟠 mở <b>cây</b> (có nguyên tử, chưa cạnh) · ô 🔴 chưa phân rã. Demo hiện có: <b className="text-ink-2">Toán 7</b> đủ để trình diễn remediation.</p>
      </div>
    </Shell>
  );
}
