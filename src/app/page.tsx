import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { DISCORD_INVITE_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const WINDS = ["東", "南", "西", "北"] as const;

export default function Home() {
  return (
    <main className="space-y-8">
      <PageHeader
        title={SITE_NAME}
        description={SITE_DESCRIPTION}
        badge="Riichi mahjong"
        action={
          <Link href="/import" className="btn-primary h-11 px-6">
            Import scores
          </Link>
        }
      />

      <div className="flex justify-center gap-2.5 py-2" aria-hidden>
        {WINDS.map((wind, i) => (
          <span key={wind} className="wind-tile" style={{ animationDelay: `${i * 80}ms` }}>
            {wind}
          </span>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-12">
        <Link href="/import" className="feature-card group md:col-span-7">
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-club-red-muted text-base font-bold text-club-red transition-transform duration-300 ease-fluid group-hover:scale-110">
                入
              </span>
              <h2 className="text-xl font-bold tracking-tight text-club-ink">Import game</h2>
            </div>
            <p className="text-muted relative mt-3 max-w-md text-sm leading-7">
              Finished playing? Enter final scores from Mahjong Soul or your notes to update the monthly
              leaderboard — the usual end-of-night workflow.
            </p>
            <span className="feature-card-cta mt-auto">
              Import scores
              <span className="feature-card-cta-arrow" aria-hidden>
                →
              </span>
            </span>
          </div>
        </Link>

        <Link href="/calculator" className="feature-card group md:col-span-5">
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-club-gold-muted text-base font-bold text-club-gold transition-transform duration-300 ease-fluid group-hover:scale-110">
                符
              </span>
              <h2 className="text-xl font-bold tracking-tight text-club-ink">Score calculator</h2>
            </div>
            <p className="text-muted relative mt-3 text-sm leading-7">
              At the table? Tap ron or tsumo and pick a common hand to see who pays.
            </p>
            <span className="feature-card-cta mt-auto">
              Open calculator
              <span className="feature-card-cta-arrow" aria-hidden>
                →
              </span>
            </span>
          </div>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-center">
        <Link
          href="/my/sessions"
          className="rounded-full border border-club-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-club-surface/80 hover:text-club-ink"
        >
          My games
        </Link>
        <Link
          href="/experimental"
          className="rounded-full border border-club-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-club-surface/80 hover:text-club-ink"
        >
          Live session tracker
        </Link>
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-club-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-club-surface/80 hover:text-club-ink"
        >
          Discord
        </a>
      </div>
    </main>
  );
}
