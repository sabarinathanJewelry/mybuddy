"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/admin/signage/playlists", label: "Playlists" },
  { href: "/admin/signage/channels", label: "Channels" },
  { href: "/admin/signage/devices", label: "Devices" },
];

export function SignageTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-line flex gap-1 mb-4">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
            pathname === tab.href ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
