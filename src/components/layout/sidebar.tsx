"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/stores/ui";
import { useAuth } from "@/stores/auth";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase/client";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";

const NAV = [
  { href: "/dashboard",    icon: "⊞", key: "nav_dashboard" as const },
  { href: "/board-rate",   icon: "📊", key: "nav_board_rate" as const },
  { href: "/customers",    icon: "👤", key: "nav_customers" as const },
  { href: "/sales",        icon: "🧾", key: "nav_sales" as const },
  { href: "/orders",       icon: "📦", key: "nav_orders" as const },
  { href: "/suppliers",    icon: "🏭", key: "nav_suppliers" as const },
  { href: "/payments",     icon: "💳", key: "nav_payments" as const },
  { href: "/daily-sheet",  icon: "📋", key: "nav_daily_sheet" as const },
  { href: "/ledger",       icon: "📒", key: "nav_ledger" as const },
  { href: "/metal-flow",      icon: "⚗️",  key: "nav_metal_flow" as const },
  { href: "/refinery-entry",  icon: "🔥", key: "nav_refinery_entry" as const },
  { href: "/bullion",      icon: "🔶", key: "nav_bullion" as const },
  { href: "/loans",        icon: "🏦", key: "nav_loans" as const },
  { href: "/expenses",     icon: "📝", key: "nav_expenses" as const },
  { href: "/writeoff",     icon: "✂️",  key: "nav_scrap" as const },
  { href: "/chits",        icon: "🪙", key: "nav_chits" as const },
  { href: "/gold-chit",    icon: "🥇", key: "nav_gold_chit" as const },
  { href: "/cash-bonus",   icon: "💰", key: "nav_cash_bonus" as const },
  { href: "/kolusu",       icon: "🪬", key: "nav_kolusu" as const },
  { href: "/kolusu-sale",  icon: "🏷️", key: "nav_kolusu_sale" as const },
  { href: "/walkins",      icon: "🚶", key: "nav_walkins" as const },
  { href: "/reports",      icon: "📈", key: "nav_reports" as const },
  { href: "/attendance",   icon: "🕐", key: "nav_attendance" as const },
  { href: "/goldsmith",    icon: "⚒️",  key: "nav_goldsmith" as const },
  { href: "/social",       icon: "📲", key: "nav_social" as const },
];

const ADMIN_NAV = [
  { href: "/admin/users",          icon: "🔑", key: "nav_admin" as const },
  { href: "/admin/products",       icon: "📦", key: "nav_products" as const },
  { href: "/admin/incentive-calc", icon: "🧮", key: "nav_incentive_calc" as const },
  { href: "/admin/payroll",        icon: "💵", key: "nav_payroll" as const },
  { href: "/admin/announcements",  icon: "📢", key: "nav_announcements" as const },
  { href: "/admin/chat",           icon: "💬", key: "nav_chat_mod" as const },
  { href: "/admin/sop",            icon: "📋", key: "nav_sop" as const },
];

function useRepairAlertCount(enabled: boolean) {
  return useQuery({
    queryKey: ["repair_alert_count"],
    enabled,
    refetchInterval: 2 * 60 * 1000, // check every 2 min
    queryFn: async () => {
      const client = supabase();
      const { data: repairs } = await client
        .from("repairs")
        .select("id, status, created_at")
        .not("status", "eq", "delivered");
      if (!repairs?.length) return 0;
      const ids = repairs.map((r: any) => r.id);
      const { data: latest } = await client
        .from("repair_stage_history")
        .select("repair_id, created_at")
        .in("repair_id", ids)
        .order("created_at", { ascending: false });
      const latestMap = new Map<string, string>();
      for (const h of (latest ?? []) as any[]) {
        if (!latestMap.has(h.repair_id)) latestMap.set(h.repair_id, h.created_at);
      }
      const now = Date.now();
      let count = 0;
      for (const r of repairs as any[]) {
        if (r.status === "got_back") { count++; continue; }
        const last = latestMap.get(r.id) ?? r.created_at;
        if ((now - new Date(last).getTime()) / 3_600_000 >= 24) count++;
      }
      return count;
    },
  });
}

interface NavItemProps {
  href: string;
  icon: string;
  label: string;
  collapsed: boolean;
  active: boolean;
  badge?: number;
}

function NavItem({ href, icon, label, collapsed, active, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      title={label}
      className={clsx(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg2 transition-colors text-sm font-medium",
        active
          ? "bg-sidebar-active text-gold"
          : "text-white/70 hover:bg-sidebar-hover hover:text-white"
      )}
    >
      <span className="text-lg shrink-0 relative">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-err text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span className="ml-auto bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const { sidebarCollapsed, mobileSidebarOpen, toggleSidebar, setMobileSidebar } = useUI();
  const profile = useAuth((s) => s.profile);
  const isAdmin    = profile?.role === "admin";
  const isSubadmin = profile?.role === "subadmin";
  const allowedModules: string[] = profile?.allowed_modules ?? [];

  function canAccess(slug: string) {
    if (isAdmin) return true;
    if (isSubadmin) return slug === "dashboard" || allowedModules.includes(slug);
    return false;
  }

  const canSeeRepairs   = isAdmin || profile?.repair_access === true || canAccess("repairs");
  const canSeeIncentive = isAdmin || profile?.incentive_access === true;
  const { data: repairAlerts = 0 } = useRepairAlertCount(canSeeRepairs);
  const [search, setSearch] = useState("");

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  const sidebarContent = (collapsed: boolean) => {
    // Build full flat list of all visible nav items
    const allItems: { href: string; icon: string; label: string; badge?: number; isAdmin?: boolean }[] = [
      ...NAV.filter(item => canAccess(item.href.slice(1))).map(item => ({ href: item.href, icon: item.icon, label: t(item.key) })),
      ...((isAdmin || canAccess("staff-management")) ? [{ href: "/staff-management", icon: "👥", label: t("nav_staff_mgmt") }] : []),
      ...(canSeeRepairs ? [{ href: "/repairs", icon: "🔧", label: t("nav_repairs"), badge: repairAlerts }] : []),
      ...(canSeeIncentive ? [{ href: "/my-incentive", icon: "🎯", label: t("nav_my_incentive") }] : []),
      ...(isAdmin ? ADMIN_NAV.map(item => ({ href: item.href, icon: item.icon, label: t(item.key), isAdmin: true })) : []),
    ];

    const q = search.trim().toLowerCase();
    const filtered = q ? allItems.filter(item => item.label.toLowerCase().includes(q)) : null;

    return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx("flex items-center gap-2 px-3 py-4 border-b border-white/10", collapsed ? "justify-center" : "")}>
        <span className="text-2xl">🔫</span>
        {!collapsed && (
          <span className="text-gold font-bold text-lg tracking-tight">MyBuddy</span>
        )}
      </div>

      {/* Search — only when expanded */}
      {!collapsed && (
        <div className="px-3 pt-2.5 pb-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search menu…"
            className="w-full bg-white/10 text-white placeholder-white/30 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gold/50"
          />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {filtered ? (
          // Search results — flat list, no dividers
          filtered.length > 0 ? filtered.map(item => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              active={pathname.startsWith(item.href)}
              badge={item.badge}
            />
          )) : (
            <p className="text-white/30 text-xs px-3 py-4 text-center">No results</p>
          )
        ) : (
          // Normal nav — sections with divider
          <>
            {NAV.filter(item => canAccess(item.href.slice(1))).map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.key)}
                collapsed={collapsed}
                active={pathname.startsWith(item.href)}
              />
            ))}

            {(isAdmin || canAccess("staff-management")) && (
              <NavItem
                href="/staff-management"
                icon="👥"
                label={t("nav_staff_mgmt")}
                collapsed={collapsed}
                active={pathname.startsWith("/staff-management")}
              />
            )}

            {canSeeRepairs && (
              <NavItem
                href="/repairs"
                icon="🔧"
                label={t("nav_repairs")}
                collapsed={collapsed}
                active={pathname.startsWith("/repairs")}
                badge={repairAlerts}
              />
            )}

            {canSeeIncentive && (
              <NavItem
                href="/my-incentive"
                icon="🎯"
                label={t("nav_my_incentive")}
                collapsed={collapsed}
                active={pathname.startsWith("/my-incentive")}
              />
            )}

            {isAdmin && (
              <>
                <div className="my-2 border-t border-white/10" />
                {ADMIN_NAV.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={t(item.key)}
                    collapsed={collapsed}
                    active={pathname.startsWith(item.href)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* User + logout */}
      <div className="border-t border-white/10 px-2 py-3 space-y-1">
        {!collapsed && profile && (
          <p className="text-white/50 text-xs px-3 truncate">{profile.display_name}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg2 text-white/50 hover:text-red-400 hover:bg-white/5 transition-colors text-sm"
        >
          <span>🚪</span>
          {!collapsed && <span>{t("nav_logout")}</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="hidden md:flex items-center gap-3 w-full px-3 py-2 rounded-lg2 text-white/30 hover:text-white/60 transition-colors text-sm"
        >
          <span>{collapsed ? "▶" : "◀"}</span>
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </div>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "hidden md:flex flex-col bg-sidebar-bg transition-all duration-200 shrink-0 h-screen sticky top-0",
          sidebarCollapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        {sidebarContent(sidebarCollapsed)}
      </aside>

      {/* Mobile drawer backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebar(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={clsx(
          "fixed top-0 left-0 h-full w-[280px] bg-sidebar-bg z-50 md:hidden transition-transform duration-200",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
