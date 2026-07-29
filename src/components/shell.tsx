"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, TreePine, Library, Cog, BarChart3, ClipboardCheck,
  SlidersHorizontal, Menu, LogOut, ChevronRight, ChevronLeft, HelpCircle, Waypoints, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { User, ROLE_LABEL, readableMath } from "@/lib/shared";
import { api, cls, getData } from "./ui";
import { LogoBadge } from "./logo";
import { baoChieuCao, dangNhung } from "@/lib/embed-client";

interface Item { href: string; label: string; icon: LucideIcon; roles?: string[] }
interface Group { title?: string; items: Item[] }

const NAV: Group[] = [
  { items: [{ href: "/", label: "Trang chủ", icon: Home }] },
  { title: "Học liệu", items: [
    { href: "/tree", label: "Cây kiến thức", icon: TreePine },
    { href: "/graph", label: "Đồ thị tri thức", icon: Waypoints },
    { href: "/library", label: "Kho học liệu", icon: Library },
  ] },
  { title: "Vận hành", items: [
    { href: "/review", label: "Chờ duyệt", icon: ClipboardCheck, roles: ["admin", "lead"] },
    { href: "/batch", label: "Xưởng sản xuất", icon: Cog, roles: ["admin"] },
    { href: "/dashboard", label: "Thống kê", icon: BarChart3, roles: ["admin", "principal", "lead"] },
  ] },
  { items: [{ href: "/settings", label: "Cài đặt", icon: SlidersHorizontal, roles: ["admin"] }] },
];

let cachedUser: User | null = null;

export default function Shell({ children, user }: { children: React.ReactNode; user: User | null }) {
  const pathname = usePathname();
  const router = useRouter();
  // Trong khung nhúng của Hub: GIỮ nguyên mọi điều hướng nội bộ (sidebar, quay lại, chuyển màn) —
  // Hub chỉ vẽ nút THOÁT ở ngoài khung. Thứ duy nhất phải bỏ là nút Đăng xuất: phiên do Hub cấp,
  // đăng xuất ở đây sẽ kết thúc luôn phiên Hub và hất người dùng ra khỏi cả siêu ứng dụng.
  const [nhung, setNhung] = useState(false);
  useEffect(() => {
    if (!dangNhung()) return;
    setNhung(true);
    baoChieuCao();
    const ro = new ResizeObserver(() => baoChieuCao());
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  const [open, setOpen] = useState(false);
  const showBack = pathname !== "/" && pathname !== "/login";
  const goBack = () => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push("/"); };
  const [u, setU] = useState<User | null>(user || cachedUser);
  if (user && u !== user) setU(user);                        // đồng bộ prop→state trong render (có guard) — pattern React chuẩn
  useEffect(() => { if (user) cachedUser = user; }, [user]); // ghi cache module = side effect → để trong effect
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false); } // đổi trang → đóng menu mobile (reset-on-prop-change)
  // thu gọn menu trái (desktop) — nhớ lựa chọn giữa các phiên
  const [navMin, setNavMin] = useState(false);
  useEffect(() => { try { setNavMin(localStorage.getItem("va_nav_min") === "1"); } catch { /* ignore */ } }, []);
  const toggleNav = () => setNavMin((v) => { const nv = !v; try { localStorage.setItem("va_nav_min", nv ? "1" : "0"); } catch { /* ignore */ } return nv; });

  // Badge "Chờ duyệt": số gói của TỔ đang chờ — chỉ tổ trưởng/quản trị; nạp lại mỗi 30s + khi đổi trang
  // (để sau khi duyệt xong quay ra là số giảm ngay).
  const [reviewCount, setReviewCount] = useState(0);
  const canReview = u?.role === "lead" || u?.role === "admin";
  useEffect(() => {
    if (!canReview) { setReviewCount(0); return; }
    let alive = true;
    const load = () => getData<{ count: number }>("reviewCount").then((d) => { if (alive) setReviewCount(d.count || 0); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [canReview, pathname]);

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || (u && n.roles.includes(u.role))) })).filter((g) => g.items.length);

  const reopenGuide = () => { try { localStorage.removeItem("va_onboard_v1"); } catch { /* ignore */ } router.push("/"); setTimeout(() => location.reload(), 60); };

  // mini=true → thanh hẹp chỉ icon (desktop thu gọn); mobile drawer luôn dùng bản đầy đủ
  const sidebar = (mini: boolean) => (
    <aside className={cls("flex h-full flex-col border-r border-line bg-surface", mini ? "w-[4.25rem]" : "w-64")}>
      <div className={cls("flex items-center border-b border-line", mini ? "flex-col gap-1.5 px-0 py-3" : "gap-2 px-4 py-4")}>
        <Link href="/" className={cls("flex items-center", mini ? "justify-center" : "min-w-0 flex-1 gap-3")} title="Học liệu Việt Anh">
          <LogoBadge size="md" className="shadow-sm" />
          {!mini && (
            <span className="leading-tight">
              <span className="block text-[15px] font-bold text-ink">Học liệu Việt Anh</span>
              <span className="block text-[11px] text-muted">Nền tảng cây kiến thức</span>
            </span>
          )}
        </Link>
        <button onClick={toggleNav} title={mini ? "Mở rộng" : "Thu gọn"} aria-label={mini ? "Mở rộng menu" : "Thu gọn menu"}
          className="hidden h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink lg:grid">
          {mini ? <ChevronRight size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
        </button>
      </div>
      {showBack && (
        <button onClick={goBack} title="Quay lại" className={cls("mx-3 mt-2 flex items-center gap-2 rounded-xl border border-line py-2 text-sm font-medium text-ink-2 transition hover:border-brand hover:bg-surface-2 hover:text-brand", mini ? "justify-center px-0" : "px-3")}>
          <ArrowLeft size={17} strokeWidth={2} aria-hidden /> {!mini && "Quay lại"}
        </button>
      )}
      <nav className="flex-1 space-y-3.5 overflow-y-auto p-3 scrollthin">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && !mini && <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted/80">{g.title}</p>}
            {g.title && mini && gi > 0 && <div className="mx-2 mb-2 border-t border-line" />}
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <Link key={n.href} href={n.href} title={n.label}
                    className={cls("group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors",
                      mini ? "justify-center px-0" : "gap-3 px-3",
                      active ? "bg-brand-bg text-brand-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                    {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-brand" />}
                    <span className="relative shrink-0">
                      <Icon size={19} strokeWidth={active ? 2 : 1.75} className={active ? "text-brand" : "text-muted group-hover:text-ink-2"} />
                      {mini && n.href === "/review" && reviewCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-brass ring-2 ring-surface" />
                      )}
                    </span>
                    {!mini && n.label}
                    {!mini && n.href === "/review" && reviewCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brass px-1.5 text-[11px] font-bold text-on-brand">{reviewCount}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {u && (
        <div className="space-y-2 border-t border-line p-3">
          <button onClick={reopenGuide} title="Hướng dẫn nhanh" className={cls("flex w-full items-center rounded-xl py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink", mini ? "justify-center px-0" : "gap-2.5 px-3")}>
            <HelpCircle size={18} className="text-muted" /> {!mini && "Hướng dẫn nhanh"}
          </button>
          <div className={cls("flex items-center rounded-xl bg-surface-2", mini ? "justify-center p-1.5" : "gap-2.5 p-2.5")} title={mini ? `${u.name} · ${ROLE_LABEL[u.role]}` : undefined}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-bg text-sm font-bold text-brand-ink">
              {u.name.split(" ").pop()?.[0] || "?"}
            </span>
            {!mini && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{u.name}</p>
                  <p className="truncate text-[11px] text-muted">{ROLE_LABEL[u.role]}{u.subject ? ` · ${u.subject}` : ""}</p>
                </div>
                {!nhung && <button title="Đăng xuất" aria-label="Đăng xuất" className="rounded-lg p-1.5 text-muted transition hover:bg-line hover:text-ink"
                  onClick={async () => {
                    cachedUser = null;
                    // Phiên đến từ một nhà cung cấp thì phải thoát cả bên đó, không chỉ xoá cookie của app —
                    // nếu không, lần bấm đăng nhập kế tiếp vào lại im lặng và người dùng tưởng chưa thoát được.
                    const r = await api<{ endSessionUrl?: string | null }>("logout").catch(() => null);
                    try { sessionStorage.removeItem("va_silent"); } catch { /* ignore */ }
                    if (r?.endSessionUrl) window.location.href = r.endSessionUrl;
                    else router.push("/login");
                  }}><LogOut size={16} /></button>}
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-y-0 left-0 hidden lg:block" style={{ zIndex: 20 }}>{sidebar(navMin)}</div>
      {open && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 45 }}>
          <div className="absolute inset-0 bg-ink/35 fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-xl">{sidebar(false)}</div>
        </div>
      )}
      <div className={cls("min-w-0 flex-1", navMin ? "lg:pl-[4.25rem]" : "lg:pl-64")}>
        <div className="sticky top-0 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur lg:hidden" style={{ zIndex: 20 }}>
          <button onClick={() => setOpen(true)} className="rounded-lg border border-line p-1.5 text-ink" aria-label="Mở menu"><Menu size={18} /></button>
          {showBack && <button onClick={goBack} aria-label="Quay lại" className="rounded-lg border border-line p-1.5 text-ink-2 transition hover:text-brand"><ArrowLeft size={18} /></button>}
          <LogoBadge size="sm" />
          <span className="text-sm font-bold text-ink">Học liệu Việt Anh</span>
        </div>
        <main className={pathname === "/graph" || pathname === "/tree" ? "w-full overflow-hidden" : "mx-auto max-w-6xl p-4 lg:p-8"}>{children}</main>
      </div>
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={13} className="text-line-strong" />}
          {it.href ? <Link href={it.href} className="transition hover:text-brand">{readableMath(it.label)}</Link> : <span className="text-ink-2">{readableMath(it.label)}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}
