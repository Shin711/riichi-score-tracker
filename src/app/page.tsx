import Link from "next/link";

import { CreateSessionCard } from "@/components/CreateSessionCard";
import { PageHeader } from "@/components/PageHeader";
import { RecentSessionCard } from "@/components/RecentSessionCard";
import { DISCORD_INVITE_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const WINDS = ["東", "南", "西", "北"] as const;

export default function Home() {
  return (
    <main className="space-y-6">
      <PageHeader
        title={SITE_NAME}
        description={SITE_DESCRIPTION}
        badge="Riichi mahjong"
        action={
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary h-10 gap-2 px-4 text-[#5865F2] hover:border-[#5865F2]/40 hover:bg-[#5865F2]/5"
          >
            Join Discord
          </a>
        }
      />

      <div className="flex justify-center gap-2 py-1" aria-hidden>
        {WINDS.map((wind) => (
          <span
            key={wind}
            className="flex h-10 w-8 items-center justify-center rounded-md border border-club-border bg-club-surface text-sm font-bold text-club-ink shadow-sm"
          >
            {wind}
          </span>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-club-gold-muted text-sm font-bold text-club-gold">
              符
            </span>
            <h2 className="text-lg font-bold tracking-tight text-club-ink">Score calculator</h2>
          </div>
          <p className="text-muted mt-2 text-sm leading-6">
            At the table? Tap ron or tsumo and pick a common hand to see who pays — no session or han/fu
            math required.
          </p>
          <Link href="/calculator" className="btn-primary mt-4 h-10 px-4">
            Open calculator
          </Link>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-club-red-muted text-sm font-bold text-club-red">
              入
            </span>
            <h2 className="text-lg font-bold tracking-tight text-club-ink">Import game</h2>
          </div>
          <p className="text-muted mt-2 text-sm leading-6">
            Finished playing? Enter final scores from Mahjong Soul or your notes to update the monthly
            leaderboard.
          </p>
          <Link href="/import" className="btn-primary mt-4 h-10 px-4">
            Import scores
          </Link>
        </div>
      </div>

      <RecentSessionCard />

      <CreateSessionCard />
    </main>
  );
}
