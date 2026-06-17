import { ScoreCalculator } from "@/components/ScoreCalculator";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "Score calculator",
  description: "Quick riichi payment lookup at the table — tap your hand and see who owes what.",
};

export default function CalculatorPage() {
  return (
    <main className="space-y-5">
      <PageHeader
        badge="At the table"
        title="Score calculator"
        description="Pick ron or tsumo, tap a common hand, and see payments instantly. No game session needed."
      />
      <ScoreCalculator />
    </main>
  );
}
