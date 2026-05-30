import { ImportGameForm } from "@/components/ImportGameForm";
import { PageHeader } from "@/components/PageHeader";

export default function ImportPage() {
  return (
    <main className="space-y-5">
      <PageHeader
        badge="Leaderboard"
        title="Import game"
        description="Add a finished friendly match from Mahjong Soul or elsewhere. Human scores count on the monthly leaderboard; mark bot seats as AI so they are stored but not ranked."
      />
      <ImportGameForm />
    </main>
  );
}
