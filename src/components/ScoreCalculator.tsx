"use client";

import { useMemo, useState } from "react";

import { calculateHandScore, type CalculatorInput } from "@/lib/scoring/calculatorDisplay";
import { FuHelper } from "@/components/FuHelper";
import type { WinType } from "@/lib/scoring/hanFu";

type QuickHand = {
  label: string;
  han: number;
  fu: number;
  group: "common" | "limit";
  hint?: string;
};

const QUICK_HANDS: QuickHand[] = [
  { label: "2 han 30 fu", han: 2, fu: 30, group: "common", hint: "e.g. riichi + pinfu (ron)" },
  { label: "2 han 40 fu", han: 2, fu: 40, group: "common", hint: "e.g. riichi + yakuhai (fu-heavy hand)" },
  { label: "3 han 30 fu", han: 3, fu: 30, group: "common", hint: "e.g. riichi + tanyao + dora 1" },
  { label: "3 han 40 fu", han: 3, fu: 40, group: "common" },
  { label: "4 han 30 fu", han: 4, fu: 30, group: "common" },
  { label: "Mangan", han: 5, fu: 30, group: "limit", hint: "5 han or 4 han 40+ fu" },
  { label: "Haneman", han: 6, fu: 30, group: "limit" },
  { label: "Baiman", han: 8, fu: 30, group: "limit" },
  { label: "Sanbaiman", han: 11, fu: 30, group: "limit" },
  { label: "Yakuman", han: 13, fu: 30, group: "limit", hint: "Single yakuman (incl. kazoe yakuman)" },
];

function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; description?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-xl border px-3 py-3 text-left transition-colors ${
            value === opt.value
              ? "border-club-red bg-club-red text-white shadow-sm shadow-club-red/20"
              : "border-club-border text-club-ink hover:border-stone-400 dark:hover:border-stone-500"
          }`}
        >
          <div className="text-sm font-semibold">{opt.label}</div>
          {opt.description ? (
            <div
              className={`mt-0.5 text-xs leading-relaxed ${
                value === opt.value ? "text-white/90" : "text-subtle"
              }`}
            >
              {opt.description}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ScoreCalculator() {
  const [winType, setWinType] = useState<WinType>("tsumo");
  const [winnerIsDealer, setWinnerIsDealer] = useState(false);
  const [han, setHan] = useState(2);
  const [fu, setFu] = useState(30);
  const [honba, setHonba] = useState(0);
  const [showCustom, setShowCustom] = useState(false);
  const [selectedQuick, setSelectedQuick] = useState("2 han 30 fu");

  function applyQuick(hand: QuickHand) {
    setSelectedQuick(hand.label);
    setHan(hand.han);
    setFu(hand.fu);
    setShowCustom(hand.han < 5);
  }

  const input: CalculatorInput = useMemo(
    () => ({ winType, winnerIsDealer, han, fu, honba }),
    [winType, winnerIsDealer, han, fu, honba]
  );

  const result = useMemo(() => calculateHandScore(input), [input]);

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">1. How did you win?</h2>
        <p className="text-muted mt-1 text-xs leading-relaxed">
          <span className="font-medium text-club-ink">Ron</span> — someone discarded
          your winning tile.{" "}
          <span className="font-medium text-club-ink">Tsumo</span> — you drew the
          winning tile yourself.
        </p>
        <div className="mt-3">
          <ToggleGroup
            value={winType}
            onChange={setWinType}
            options={[
              {
                value: "ron",
                label: "Ron",
                description: "One player pays the full amount (who discarded)",
              },
              {
                value: "tsumo",
                label: "Tsumo (self-draw)",
                description: "All three opponents split the payment",
              },
            ]}
          />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">2. Are you the dealer?</h2>
        <p className="text-muted mt-1 text-xs">
          The dealer (East seat) pays and receives more. If you are not sure, ask who has the dealer
          marker.
        </p>
        <div className="mt-3">
          <ToggleGroup
            value={winnerIsDealer ? "yes" : "no"}
            onChange={(v) => setWinnerIsDealer(v === "yes")}
            options={[
              { value: "no", label: "No — I am not dealer", description: "Standard non-dealer scoring" },
              { value: "yes", label: "Yes — I am dealer", description: "About 50% higher payments" },
            ]}
          />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">3. Hand value (han & fu)</h2>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Count your yaku for <span className="font-medium">han</span>. Use your fu count, or pick a
              common hand below if you are still learning fu.
            </p>
            <p className="mt-1 text-[11px] text-subtle">
              Tip: for <span className="font-medium text-club-ink">1 han</span> hands, fu matters most — use
              Fu helper for a more reliable result.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="text-muted shrink-0 text-xs font-medium underline"
          >
            {showCustom ? "Hide custom" : "Custom han/fu"}
          </button>
        </div>

        <div className="notice-inset mt-3">
          <span className="font-medium">Beginner path:</span> Choose{" "}
          <span className="font-medium">Ron/Tsumo</span> and <span className="font-medium">Dealer</span>, then
          open <span className="font-medium">Fu helper</span> if your fu is uncertain.
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-1 text-[11px] font-medium text-muted">Common hands</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_HANDS.filter((h) => h.group === "common").map((hand) => (
                <button
                  key={hand.label}
                  type="button"
                  onClick={() => applyQuick(hand)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    selectedQuick === hand.label
                      ? "border-club-red bg-club-red text-white shadow-sm shadow-club-red/20"
                      : "border-club-border text-club-ink dark:border-stone-600"
                  }`}
                >
                  <div className="font-semibold">{hand.label}</div>
                  {hand.hint ? (
                    <div
                      className={`mt-0.5 ${selectedQuick === hand.label ? "text-white/90" : "text-subtle"}`}
                    >
                      {hand.hint}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium text-muted">Limit hands</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_HANDS.filter((h) => h.group === "limit").map((hand) => (
                <button
                  key={hand.label}
                  type="button"
                  onClick={() => applyQuick(hand)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    selectedQuick === hand.label
                      ? "border-club-red bg-club-red text-white shadow-sm shadow-club-red/20"
                      : "border-club-border text-club-ink dark:border-stone-600"
                  }`}
                >
                  <div className="font-semibold">{hand.label}</div>
                  {hand.hint ? (
                    <div
                      className={`mt-0.5 ${selectedQuick === hand.label ? "text-white/90" : "text-subtle"}`}
                    >
                      {hand.hint}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showCustom ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-xs">
              Han (yaku count)
              <input
                type="number"
                min={1}
                max={99}
                value={han}
                onChange={(e) => {
                  setSelectedQuick("");
                  setHan(Math.max(1, Number(e.target.value) || 1));
                }}
                className="field mt-1 h-11 w-full px-2 text-sm"
              />
            </label>
            <label className="text-xs">
              Fu {han >= 5 ? "(not used at limit hands)" : ""}
              <input
                type="number"
                min={20}
                max={110}
                step={10}
                value={fu}
                disabled={han >= 5}
                onChange={(e) => {
                  setSelectedQuick("");
                  setFu(Number(e.target.value) || 30);
                }}
                className="field mt-1 h-11 w-full px-2 text-sm disabled:opacity-50"
              />
            </label>
          </div>
        ) : null}

        <FuHelper
          winType={winType}
          onApply={(computedFu) => {
            setFu(computedFu);
            setSelectedQuick("");
            setShowCustom(true);
          }}
        />
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">4. Honba sticks (optional)</h2>
        <p className="text-muted mt-1 text-xs">
          If there were repeat counters on the table from previous dealer wins or draws, add them here
          (usually 300 pts each; 900 total on tsumo).
        </p>
        <input
          type="number"
          min={0}
          max={20}
          value={honba}
          onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
          className="field mt-2 h-11 w-24 px-2 text-sm"
          aria-label="Honba sticks on table"
        />
      </section>

      {result ? (
        <section className="jade-panel">
          <div className="jade-panel-label">You receive</div>
          <div className="jade-panel-fg mt-1 font-mono text-4xl font-bold tabular-nums tracking-tight">
            {result.total.toLocaleString()}
            <span className="jade-panel-label ml-2 text-lg font-semibold normal-case">pts</span>
          </div>
          <div className="jade-panel-muted mt-2 text-sm">
            {winType === "ron" ? "Ron" : "Tsumo"} · {result.handLabel}
            {winnerIsDealer ? " · dealer win" : ""}
          </div>

          <div className="card mt-4 p-3">
            <div className="text-xs font-semibold text-club-ink">Who pays</div>
            <ul className="mt-2 space-y-2">
              {result.payments.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 text-sm text-club-ink"
                >
                  <span>{row.label}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {row.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            {result.honbaNote ? (
              <p className="text-muted mt-2 text-xs">{result.honbaNote}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="text-muted text-xs leading-relaxed">
        Uses standard riichi scoring (EMA-style han/fu tables). Fu is rounded up to the nearest 10.
        This tool helps at the table — for live games, use{" "}
        <span className="font-medium text-club-ink">New game</span> to track scores
        automatically.
      </p>
    </div>
  );
}
