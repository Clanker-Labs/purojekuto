"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarRange, FolderKanban, Home, Lightbulb, Plus, Settings, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/planning", label: "Planning", icon: CalendarRange },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
] as const;

const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Sidebar from `lg` up; a top bar and a bottom tab bar on phones. */
export function Shell({ children, userName }: { children: ReactNode; userName: string }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <Link href="/" className="px-5 pt-5 pb-6">
          <Wordmark size={30} />
        </Link>
        <Link
          href="/projects/new"
          className="mx-4 mb-4 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-semibold text-accent-ink hover:brightness-105"
        >
          <Plus size={16} /> New project
        </Link>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(path, href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                active(path, href) ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/settings"
          className={clsx(
            "m-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
            active(path, "/settings") ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          <Settings size={17} />
          <span className="min-w-0 flex-1 truncate">Settings</span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2">{userName.slice(0, 1).toUpperCase()}</span>
        </Link>
      </aside>

      <header className="safe-top sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/">
          <Wordmark size={26} />
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/projects/new" aria-label="New project" className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-ink">
            <Plus size={18} />
          </Link>
          <Link href="/settings" aria-label="Settings" className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
            <Settings size={18} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        {NAV.filter((n) => n.href !== "/ideas").map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(path, href) ? "page" : undefined}
            className={clsx("flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-medium", active(path, href) ? "text-accent-text" : "text-muted")}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
