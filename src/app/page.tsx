import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { DISCORD_INVITE_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const WINDS = [
  { glyph: "東", tone: "wind-tile-east" },
  { glyph: "南", tone: "wind-tile-south" },
  { glyph: "西", tone: "wind-tile-west" },
  { glyph: "北", tone: "wind-tile-north" },
] as const;

const TILES = [
  {
    href: "/import",
    glyph: "入",
    tone: "arcade-tile-red",
    title: "Import game",
    body: "Finished playing? Enter final scores from Mahjong Soul or your notes to update the monthly leaderboard.",
    cta: "Import scores",
    span: "md:col-span-7",
  },
  {
    href: "/calculator",
    glyph: "符",
    tone: "arcade-tile-gold",
    title: "Score calculator",
    body: "At the table? Tap ron or tsumo and pick a common hand to see who pays.",
    cta: "Open calculator",
    span: "md:col-span-5",
  },
  {
    href: "/leaderboard",
    glyph: "順",
    tone: "arcade-tile-jade",
    title: "Leaderboard",
    body: "See who's on top this month and how the standings are shifting.",
    cta: "View standings",
    span: "md:col-span-12",
  },
] as const;

export default function Home() {
  return (
    <main className="space-y-9">
      <section className="page-hero px-6 py-14 sm:px-12 sm:py-20">
        <div className="page-hero-wash page-hero-wash-red" aria-hidden />
        <div className="page-hero-wash page-hero-wash-jade" aria-hidden />

        <div className="relative flex flex-col items-center gap-6 text-center">
          <BrandMark className="h-36 w-36 sm:h-44 sm:w-44" priority />

          <span className="arcade-badge">
            <span className="arcade-badge-dot" aria-hidden />
            Riichi mahjong
          </span>

          <h1 className="page-hero-title">{SITE_NAME}</h1>

          <p className="page-hero-desc">{SITE_DESCRIPTION}</p>

          <div className="page-hero-action pt-2">
            <Link href="/import" className="btn-primary h-12 px-7 text-base">
              Import scores
            </Link>
            <Link href="/leaderboard" className="btn-secondary h-12 px-6 text-base">
              Leaderboard
            </Link>
          </div>

          <div className="flex justify-center gap-4 pt-6 sm:gap-5" aria-hidden>
            {WINDS.map((wind, i) => (
              <span
                key={wind.glyph}
                className={`wind-tile-arcade ${wind.tone}`}
                style={{ animationDelay: `${i * 220}ms` }}
              >
                {wind.glyph}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-12">
        {TILES.map((tile) => (
          <Link key={tile.href} href={tile.href} className={`arcade-tile ${tile.tone} group ${tile.span}`}>
            <div className="flex items-center gap-3.5">
              <span className="arcade-glyph" aria-hidden>
                {tile.glyph}
              </span>
              <h2 className="text-xl font-bold tracking-tight text-club-ink sm:text-2xl">{tile.title}</h2>
            </div>
            <p className="text-muted mt-3 max-w-md text-sm leading-7">{tile.body}</p>
            <span className="arcade-cta">
              {tile.cta}
              <span className="feature-card-cta-arrow" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5 text-center">
        <Link href="/my/sessions" className="arcade-chip">
          My games
        </Link>
        <Link href="/players" className="arcade-chip">
          Players
        </Link>
        <Link href="/experimental" className="arcade-chip">
          Live session tracker
        </Link>
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="arcade-chip">
          Discord
        </a>
      </div>
    </main>
  );
}
