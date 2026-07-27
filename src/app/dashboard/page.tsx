"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Wallet, ClipboardCheck, Workflow, RefreshCw, History } from "lucide-react";
import Shell from "@/components/shell";
import { getData, Card, PageLoading, Progress, FormatIcon, Empty, timeAgo, cls } from "@/components/ui";
import { TreeNode, Activity, User, AssetFormat, FORMAT_LABEL } from "@/lib/shared";

interface Chapter { id: string; title: string; atomCount: number; approved: number; pending: number; drafted: number; total: number; questionCount: number; ladderCount: number; atomsWithQ: number; atomsWithL: number }
interface SubjectStats { atomCount: number; totalPkgs: number; drafted: number; draft_ai: number; edited: number; pending: number; approved: number; assetsReady: number; assetsOutdated: number; coveragePct: number; draftPct: number }
interface DashData {
  subjects: (TreeNode & { stats: SubjectStats; chapters: Chapter[] })[];
  byFormat: { format: AssetFormat; ready: number; outdated: number }[];
  tokens: number; spentUsd: number; budget: number; activity: Activity[]; reviews: number; jobs: number;
  questionCount: number; ladderCount: number; atomsWithQ: number; atomsWithL: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {});
    getData<DashData>("dashboard").then(setData).catch(() => {});
  }, []);
  if (!data) return <Shell user={me}><PageLoading /></Shell>;

  const budgetPct = Math.round((data.spentUsd / data.budget) * 100);
  const overBudget = budgetPct > 80;

  return (
    <Shell user={me}>
      <div className="fade-up">
        <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">Độ phủ học liệu trên cây kiến thức và chi phí vận hành — góc nhìn cho BGH.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><Coins size={15} strokeWidth={1.75} className="text-brass-ink" aria-hidden />Tổng token đã dùng</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{data.tokens.toLocaleString("vi-VN")}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><Wallet size={15} strokeWidth={1.75} className={overBudget ? "text-danger" : "text-ink-2"} aria-hidden />Chi phí AI</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">${data.spentUsd}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Progress value={budgetPct} tone={overBudget ? "warn" : "ok"} />
              <span className={cls("text-xs font-semibold", overBudget ? "text-danger" : "text-muted")}>{budgetPct}%</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">trần ${data.budget}/tháng</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><ClipboardCheck size={15} strokeWidth={1.75} className="text-brand" aria-hidden />Ngân hàng câu hỏi</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{data.questionCount.toLocaleString("vi-VN")}</p>
            <p className="mt-1 text-[11px] text-muted">phủ {data.atomsWithQ.toLocaleString("vi-VN")} nguyên tử</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><Workflow size={15} strokeWidth={1.75} className="text-brass-ink" aria-hidden />Thang Socratic</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{data.ladderCount.toLocaleString("vi-VN")}</p>
            <p className="mt-1 text-[11px] text-muted">phủ {data.atomsWithL.toLocaleString("vi-VN")} nguyên tử</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><ClipboardCheck size={15} strokeWidth={1.75} className="text-ok" aria-hidden />Lượt duyệt đã thực hiện</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{data.reviews}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted"><Workflow size={15} strokeWidth={1.75} className="text-brand" aria-hidden />Job dây chuyền</div>
            <p className="mt-1 font-display text-3xl font-semibold text-ink">{data.jobs}</p>
          </Card>
        </div>

        {data.subjects.map((s) => (
          <div key={s.id} className="mt-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">{s.title}</h2>
              <span className="text-xs text-muted">{s.stats.atomCount} nguyên tử · {s.chapters.reduce((n, c) => n + (c.questionCount ?? 0), 0).toLocaleString("vi-VN")} câu hỏi · {s.chapters.reduce((n, c) => n + (c.ladderCount ?? 0), 0).toLocaleString("vi-VN")} thang · {s.stats.approved}/{s.stats.totalPkgs} gói Chuẩn trường</span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted">Độ phủ <Progress value={s.stats.coveragePct} className="w-28" /> <b className="text-ok">{s.stats.coveragePct}%</b></span>
            </div>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Lớp</th>
                    <th className="px-4 py-2.5 font-medium">Nguyên tử</th>
                    <th className="px-4 py-2.5 font-medium">Câu hỏi</th>
                    <th className="px-4 py-2.5 font-medium">Thang Socratic</th>
                    <th className="px-4 py-2.5 font-medium">Đã nháp</th>
                    <th className="px-4 py-2.5 font-medium">Chờ duyệt</th>
                    <th className="px-4 py-2.5 font-medium">Chuẩn trường</th>
                    <th className="w-40 px-4 py-2.5 font-medium">Độ phủ</th>
                  </tr>
                </thead>
                <tbody>
                  {s.chapters.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">{c.title}</td>
                      <td className="px-4 py-2.5 text-ink-2">{c.atomCount}</td>
                      <td className="px-4 py-2.5 text-ink-2">{c.questionCount ? `${c.questionCount.toLocaleString("vi-VN")} · ${c.atomsWithQ}/${c.atomCount} nt` : "—"}</td>
                      <td className="px-4 py-2.5 text-ink-2">{c.ladderCount ? `${c.ladderCount.toLocaleString("vi-VN")} · ${c.atomsWithL}/${c.atomCount} nt` : "—"}</td>
                      <td className="px-4 py-2.5 text-ink-2">{c.drafted}/{c.total}</td>
                      <td className="px-4 py-2.5 text-brass-ink">{c.pending}</td>
                      <td className="px-4 py-2.5 font-semibold text-ok">{c.approved}/{c.total}</td>
                      <td className="px-4 py-2.5"><Progress value={c.total ? (c.approved / c.total) * 100 : 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        ))}

        <h2 className="mt-8 mb-3 font-display text-lg font-semibold text-ink">Học liệu theo định dạng</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.byFormat.map((f) => (
            <Card key={f.format} className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FormatIcon format={f.format} size={24} className="text-brand" /> {FORMAT_LABEL[f.format]}</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{f.ready}</p>
              {f.outdated > 0 && <p className="flex items-center gap-1 text-xs text-warn"><RefreshCw size={12} strokeWidth={1.75} aria-hidden />{f.outdated} cần cập nhật</p>}
            </Card>
          ))}
        </div>

        <h2 className="mt-8 mb-3 font-display text-lg font-semibold text-ink">Nhật ký hoạt động</h2>
        {data.activity.length === 0 ? (
          <Empty icon={<History size={28} strokeWidth={1.75} />} title="Chưa có hoạt động nào" hint="Các thao tác nháp, gửi duyệt và duyệt gói sẽ hiện ở đây." />
        ) : (
          <Card className="divide-y divide-line">
            {data.activity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <p className="min-w-0 flex-1 truncate text-ink-2">
                  <b className="text-ink">{a.by}</b> {a.action} {a.href ? <Link href={a.href} className="text-brand hover:underline">{a.target}</Link> : a.target}
                </p>
                <span className="shrink-0 text-xs text-muted">{timeAgo(a.at)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Shell>
  );
}
