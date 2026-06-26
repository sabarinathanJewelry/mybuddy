"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/stores/auth";

const PREF_KEY = "admin_smart_view";

type CardDef = { icon: string; label: string; href: string };
type Section = { title: string; cards: CardDef[]; adminOnly?: boolean };

const SECTIONS: Section[] = [
  {
    title: "Sales & Customers",
    cards: [
      { icon: "🧾", label: "Sales",     href: "/sales" },
      { icon: "📦", label: "Orders",    href: "/orders" },
      { icon: "👤", label: "Customers", href: "/customers" },
      { icon: "💳", label: "Payments",  href: "/payments" },
      { icon: "🚶", label: "Walk-ins",  href: "/walkins" },
    ],
  },
  {
    title: "Finance & Reports",
    cards: [
      { icon: "📋", label: "Daily Sheet",  href: "/daily-sheet" },
      { icon: "📒", label: "Ledger",       href: "/ledger" },
      { icon: "📈", label: "Reports",      href: "/reports" },
      { icon: "📝", label: "Expenses",     href: "/expenses" },
      { icon: "🏦", label: "Loans",        href: "/loans" },
      { icon: "📊", label: "Investments",  href: "/investments" },
    ],
  },
  {
    title: "Metal & Savings",
    cards: [
      { icon: "📊", label: "Board Rate",   href: "/board-rate" },
      { icon: "⚗️",  label: "Metal Flow",  href: "/metal-flow" },
      { icon: "🔥", label: "Refinery",     href: "/refinery-entry" },
      { icon: "🔶", label: "Bullion",      href: "/bullion" },
      { icon: "🥇", label: "Gold Chit",    href: "/gold-chit" },
      { icon: "🪙", label: "Chits",        href: "/chits" },
      { icon: "💰", label: "Cash Bonus",   href: "/cash-bonus" },
      { icon: "🪬", label: "Kolusu",       href: "/kolusu" },
      { icon: "✂️",  label: "Write-off",   href: "/writeoff" },
    ],
  },
  {
    title: "Staff & Operations",
    cards: [
      { icon: "🕐", label: "Attendance",   href: "/attendance" },
      { icon: "📅", label: "Weekoffs",     href: "/admin/weekoffs" },
      { icon: "⚒️",  label: "Goldsmith",  href: "/goldsmith" },
      { icon: "🏭", label: "Suppliers",    href: "/suppliers" },
      { icon: "💹", label: "AV Income",   href: "/av-income" },
    ],
  },
  {
    title: "Tools",
    cards: [
      { icon: "⭐", label: "Review",     href: "/google-review" },
      { icon: "📲", label: "Social",     href: "/social" },
    ],
  },
  {
    title: "Admin",
    adminOnly: true,
    cards: [
      { icon: "🔑", label: "Users",          href: "/admin/users" },
      { icon: "📦", label: "Products",       href: "/admin/products" },
      { icon: "🧮", label: "Incentive",      href: "/admin/incentive-calc" },
      { icon: "💵", label: "Payroll",        href: "/admin/payroll" },
      { icon: "📢", label: "Notices",        href: "/admin/announcements" },
      { icon: "💬", label: "Chat Mod",       href: "/admin/chat" },
      { icon: "📋", label: "SOP",            href: "/admin/sop" },
    ],
  },
];

export default function DashboardPage() {
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const [smart, setSmart] = useState(true);

  useEffect(() => {
    setSmart(localStorage.getItem(PREF_KEY) !== "classic");
  }, []);

  function toggle(v: boolean) {
    setSmart(v);
    localStorage.setItem(PREF_KEY, v ? "smart" : "classic");
  }

  const sections = SECTIONS.filter(s => !s.adminOnly || isAdmin);

  if (!smart) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-ink">Quick Access</h1>
          <button onClick={() => toggle(true)}
            className="text-xs text-gold underline underline-offset-2">
            Switch to smart view
          </button>
        </div>
        <p className="text-sm text-ink-dim">Use the sidebar to navigate.</p>
        <Link href="/daily-sheet"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-lg2 text-sm font-medium">
          Go to Daily Sheet →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-lg font-bold text-ink">
            Hi, {profile?.display_name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-xs text-ink-dim">Sabarinathan Jewellery</p>
        </div>
        <button onClick={() => toggle(false)}
          className="text-xs text-ink-dim underline underline-offset-2">
          Classic view
        </button>
      </div>

      {sections.map(sec => (
        <div key={sec.title}>
          <p className="text-[11px] font-bold tracking-widest text-ink-dim uppercase mb-2">{sec.title}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {sec.cards.map(c => (
              <Link key={c.href} href={c.href}
                className="bg-canvas border border-line rounded-lg2 shadow-soft p-4 flex flex-col items-center gap-2 hover:border-gold/50 active:scale-95 transition-all">
                <span className="text-3xl">{c.icon}</span>
                <span className="text-[11px] font-semibold text-ink uppercase tracking-wide leading-tight text-center">{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
