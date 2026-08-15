import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { DISCORD_INVITE_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const FEATURES = [
  {
    href: "/import",
    title: "Import game",
    body: "Enter final scores from Mahjong Soul or your notes to update the monthly leaderboard.",
    cta: "Import scores",
  },
  {
    href: "/calculator",
    title: "Score calculator",
    body: "At the table? Tap ron or tsumo and pick a common hand to see who pays.",
    cta: "Open calculator",
  },
  {
    href: "/leaderboard",
    title: "Leaderboard",
    body: "See who's on top this month and how the standings are shifting.",
    cta: "View standings",
  },
] as const;

export default function Home() {
  return (
    <main className="space-y-10">
      <section className="home-hero">
        <BrandMark className="h-24 w-24 sm:h-28 sm:w-28" priority />
        <div className="mx-auto max-w-2xl space-y-3">
          <h1 className="home-hero-title">{SITE_NAME}</h1>
          <p className="home-hero-desc">{SITE_DESCRIPTION}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/import" className="btn-primary h-11 px-6">
            Import scores
          </Link>
          <Link href="/leaderboard" className="btn-secondary h-11 px-5">
            Leaderboard
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <Link key={feature.href} href={feature.href} className="home-card group">
            <h2 className="text-lg font-semibold tracking-tight text-club-ink">{feature.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">{feature.body}</p>
            <span className="home-card-cta">
              {feature.cta}
              <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </section>

      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/my/sessions" className="home-link">
          My games
        </Link>
        <Link href="/players" className="home-link">
          Players
        </Link>
        <Link href="/experimental" className="home-link">
          Live session
        </Link>
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="home-link">
          Discord
        </a>
      </nav>
    </main>
  );
}
