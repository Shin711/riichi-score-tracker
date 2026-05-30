"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { CreateSessionButton } from "@/components/CreateSessionButton";
import { SITE_HEADER, SITE_NAME } from "@/lib/site";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "nav-link-active bg-club-red-muted dark:bg-club-red-muted"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
      }`}
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
          className="flex h-12 w-12 items-center justify-center rounded-full bg-club-red text-xl font-semibold text-white shadow-lg shadow-club-red/30 hover:bg-club-red-dark"
        />
        <span className="mt-1 text-[10px] font-medium text-stone-500 dark:text-stone-400">New</span>
      </div>
    );
  }

  return (
    <Link
      href={href!}
      className={`relative flex flex-1 flex-col items-center justify-center px-1 py-2 text-[10px] font-medium ${
        active ? "text-club-red dark:text-red-400" : "text-stone-500 dark:text-stone-400"
      }`}
    >
      {active ? (
        <span className="absolute top-1 h-1 w-1 rounded-full bg-club-red dark:bg-red-400" aria-hidden />
      ) : null}
      <span className="text-xs">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-bg flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/85 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/85">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
            <BrandMark className="h-9 w-9 text-base" />
            <span className="text-stone-900 dark:text-stone-50">
              <span className="sm:hidden">{SITE_HEADER}</span>
              <span className="hidden sm:inline">{SITE_NAME}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink href="/players" label="Players" />
            <NavLink href="/calculator" label="Calculator" />
            <NavLink href="/leaderboard" label="Leaderboard" />
            <NavLink href="/import" label="Import" />
            <NavLink href="/my/sessions" label="My games" />
            <NavLink href="/login" label="Account" />
            <CreateSessionButton label="New game" className="btn-primary ml-2 h-10" />
          </nav>
          <div className="sm:hidden">
            <CreateSessionButton label="New game" className="btn-primary h-10 px-4 text-xs" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:py-8 sm:pb-8">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/90 bg-white/95 backdrop-blur-md sm:hidden dark:border-stone-800/90 dark:bg-stone-950/95">
        <div className="mx-auto flex max-w-5xl items-stretch">
          <BottomNavItem href="/" label="Home" />
          <BottomNavItem href="/players" label="Players" />
          <BottomNavItem primary label="New" />
          <BottomNavItem href="/calculator" label="Calc" />
          <BottomNavItem href="/leaderboard" label="Board" />
          <BottomNavItem href="/my/sessions" label="Games" />
          <BottomNavItem href="/login" label="Account" />
        </div>
      </nav>
    </div>
  );
}
