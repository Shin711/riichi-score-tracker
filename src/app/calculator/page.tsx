import { ScoreCalculator } from "@/components/ScoreCalculator";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Score calculator",
  description: "Calculate riichi mahjong hand payments for beginners — ron, tsumo, han and fu.",
};

export default function CalculatorPage() {
  return (
    <main className="space-y-5">
      <PageHeader
        badge="Beginner friendly"
        title="Score calculator"
        description="Answer a few questions and see how many points you should collect. No account or game session needed."
      />
      <ScoreCalculator />
    </main>
  );
}
