"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CreateSessionButton } from "@/components/CreateSessionButton";
import { SITE_HEADER, SITE_NAME } from "@/lib/site";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`text-sm ${active ? "font-medium text-zinc-950 dark:text-white" : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"}`}
    >
      {label}
    </Link>
  );
}

function BottomNavItem({
  href,
  label,
  primary,
}: {
  href?: string;
  label: string;
  primary?: boolean;
}) {
  const pathname = usePathname();
  const active = href ? pathname === href || (href !== "/" && pathname.startsWith(href)) : false;

  if (primary) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-1">
        <CreateSessionButton
          label="+"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-xl font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-950"
        />
        <span className="mt-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">New</span>
      </div>
    );
  }

  return (
    <Link
      href={href!}
      className={`flex flex-1 flex-col items-center justify-center px-1 py-2 text-[10px] font-medium ${
        active ? "text-zinc-950 dark:text-white" : "text-zinc-500 dark:text-zinc-400"
      }`}
    >
      <span className="text-xs">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="shrink-0 font-semibold tracking-tight"
            title={SITE_NAME}
          >
            <span className="sm:hidden">{SITE_HEADER}</span>
            <span className="hidden sm:inline">{SITE_NAME}</span>
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            <NavLink href="/players" label="Players" />
            <NavLink href="/leaderboard" label="Leaderboard" />
            <NavLink href="/import" label="Import" />
            <NavLink href="/my/sessions" label="My games" />
            <NavLink href="/login" label="Account" />
            <CreateSessionButton label="New game" />
          </nav>
          <div className="sm:hidden">
            <CreateSessionButton label="New game" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:py-8 sm:pb-8">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-5xl items-stretch">
          <BottomNavItem href="/" label="Home" />
          <BottomNavItem href="/players" label="Players" />
          <BottomNavItem primary label="New" />
          <BottomNavItem href="/leaderboard" label="Board" />
          <BottomNavItem href="/my/sessions" label="Games" />
          <BottomNavItem href="/login" label="Account" />
        </div>
      </nav>
    </>
  );
}
