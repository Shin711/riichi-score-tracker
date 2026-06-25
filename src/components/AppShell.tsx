"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { PageTransition } from "@/components/PageTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_HEADER, SITE_NAME } from "@/lib/site";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm transition-all duration-200 ${
        active
          ? "nav-link-active bg-club-red-muted/85 shadow-sm dark:bg-club-red-muted"
          : "text-club-muted hover:-translate-y-px hover:bg-club-red-muted/70 hover:text-club-ink dark:hover:bg-club-red-muted/80"
      }`}
    >
      {label}
    </Link>
  );
}

function BottomNavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`relative mx-0.5 my-1 flex flex-1 flex-col items-center justify-center rounded-xl px-1 py-2 text-[10px] font-medium transition-all duration-300 ease-fluid ${
        active ? "bottom-nav-active font-semibold text-club-red dark:text-red-300" : "text-muted"
      }`}
    >
      <span className="text-xs">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell-bg flex min-h-full flex-col">
      <div className="ambient-orb ambient-orb-red" aria-hidden />
      <div className="ambient-orb ambient-orb-jade" aria-hidden />
      <header className="shell-bar sticky top-0 z-40 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3.5">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5 font-semibold tracking-tight transition-opacity duration-300 hover:opacity-90"
          >
            <BrandMark className="h-11 w-11" priority />
            <span className="arcade-title">
              <span className="sm:hidden">{SITE_HEADER}</span>
              <span className="hidden sm:inline">{SITE_HEADER}</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <NavLink href="/players" label="Players" />
            <NavLink href="/calculator" label="Calculator" />
            <NavLink href="/leaderboard" label="Leaderboard" />
            <NavLink href="/import" label="Import" />
            <NavLink href="/my/sessions" label="My games" />
            <NavLink href="/login" label="Account" />
            <Link href="/import" className="btn-primary ml-2 h-10 px-5">
              Import scores
            </Link>
          </nav>
          <div className="sm:hidden">
            <Link href="/import" className="btn-primary h-10 px-4 text-xs">
              Import
            </Link>
          </div>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-5xl flex-1 px-4 py-7 pb-24 sm:py-9 sm:pb-9">
        <PageTransition>{children}</PageTransition>
      </div>

      <SiteFooter />

      <nav className="shell-bar fixed inset-x-0 bottom-0 z-40 border-t sm:hidden">
        <div className="mx-auto flex max-w-5xl items-stretch">
          <BottomNavItem href="/" label="Home" />
          <BottomNavItem href="/players" label="Players" />
          <BottomNavItem href="/calculator" label="Calc" />
          <BottomNavItem href="/leaderboard" label="Board" />
          <BottomNavItem href="/import" label="Import" />
          <BottomNavItem href="/my/sessions" label="Games" />
          <BottomNavItem href="/login" label="Account" />
        </div>
      </nav>
    </div>
  );
}
