"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/stores/ui";
import { useAuth } from "@/stores/auth";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase/client";
import { clsx } from "clsx";

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
  { href: "/metal-flow",   icon: "⚗️",  key: "nav_metal_flow" as const },
  { href: "/bullion",      icon: "🔶", key: "nav_bullion" as const },
  { href: "/loans",        icon: "🏦", key: "nav_loans" as const },
  { href: "/expenses",     icon: "📝", key: "nav_expenses" as const },
  { href: "/writeoff",     icon: "✂️",  key: "nav_scrap" as const },
  { href: "/chits",        icon: "🪙", key: "nav_chits" as const },
  { href: "/gold-chit",    icon: "🥇", key: "nav_gold_chit" as const },
  { href: "/cash-bonus",   icon: "💰", key: "nav_cash_bonus" as const },
  { href: "/walkins",      icon: "🚶", key: "nav_walkins" as const },
  { href: "/reports",      icon: "📈", key: "nav_reports" as const },
];

const ADMIN_NAV = [
  { href: "/admin/users",  icon: "🔑", key: "nav_admin" as const },
];

interface NavItemProps {
  href: string;
  icon: string;
  label: string;
  collapsed: boolean;
  active: boolean;
}

function NavItem({ href, icon, label, collapsed, active }: NavItemProps) {
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
      <span className="text-lg shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const { sidebarCollapsed, mobileSidebarOpen, toggleSidebar, setMobileSidebar } = useUI();
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin";

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  const sidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx("flex items-center gap-2 px-3 py-4 border-b border-white/10", collapsed ? "justify-center" : "")}>
        <span className="text-2xl">🔫</span>
        {!collapsed && (
          <span className="text-gold font-bold text-lg tracking-tight">MyBuddy</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={t(item.key)}
            collapsed={collapsed}
            active={pathname.startsWith(item.href)}
          />
        ))}

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
