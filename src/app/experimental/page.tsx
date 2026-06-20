import Link from "next/link";

import { CreateSessionCard } from "@/components/CreateSessionCard";
import { PageHeader } from "@/components/PageHeader";
import { RecentSessionCard } from "@/components/RecentSessionCard";

export default function ExperimentalPage() {
  return (
    <main className="space-y-7">
      <PageHeader
        badge="Experimental"
        title="Live session tracker"
        description="Tournament-style scoring where you record every round at the table. Most club nights use Import instead — this is for hosts who want a full hand-by-hand ledger."
        action={
          <Link href="/import" className="btn-secondary h-11 px-5">
            Import scores
          </Link>
        }
      />

      <RecentSessionCard />

      <CreateSessionCard />

      <p className="text-center text-xs text-subtle">
        Sessions can be claimed to your account from inside the live game view.
      </p>
    </main>
  );
}
