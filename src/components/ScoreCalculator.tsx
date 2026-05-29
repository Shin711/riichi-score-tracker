"use client";

import { useMemo, useState } from "react";

import { calculateHandScore, type CalculatorInput } from "@/lib/scoring/calculatorDisplay";
import { FuHelper } from "@/components/FuHelper";
import type { WinType } from "@/lib/scoring/hanFu";

type QuickHand = {
  label: string;
  han: number;
  fu: number;
  hint?: string;
};

const QUICK_HANDS: QuickHand[] = [
  { label: "2 han 30 fu", han: 2, fu: 30, hint: "e.g. riichi + tanyao" },
  { label: "2 han 40 fu", han: 2, fu: 40, hint: "e.g. riichi + pinfu" },
  { label: "3 han 30 fu", han: 3, fu: 30, hint: "e.g. riichi + sanshoku" },
  { label: "3 han 40 fu", han: 3, fu: 40 },
  { label: "4 han 30 fu", han: 4, fu: 30 },
  { label: "Mangan", han: 5, fu: 30, hint: "5 han or 4 han 40+ fu" },
  { label: "Haneman", han: 6, fu: 30 },
  { label: "Baiman", han: 8, fu: 30 },
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
              ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
              : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
          }`}
        >
          <div className="text-sm font-semibold">{opt.label}</div>
          {opt.description ? (
            <div
              className={`mt-0.5 text-xs leading-relaxed ${
                value === opt.value ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500"
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
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h2 className="text-sm font-semibold">1. How did you win?</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Ron</span> — someone discarded
          your winning tile.{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Tsumo</span> — you drew the
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

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h2 className="text-sm font-semibold">2. Are you the dealer?</h2>
        <p className="mt-1 text-xs text-zinc-500">
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

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">3. Hand value (han & fu)</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Count your yaku for <span className="font-medium">han</span>. Use your fu count, or pick a
              common hand below if you are still learning fu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="shrink-0 text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
          >
            {showCustom ? "Hide custom" : "Custom han/fu"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_HANDS.map((hand) => (
            <button
              key={hand.label}
              type="button"
              onClick={() => applyQuick(hand)}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${
                selectedQuick === hand.label
                  ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="font-semibold">{hand.label}</div>
              {hand.hint ? (
                <div
                  className={`mt-0.5 ${selectedQuick === hand.label ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500"}`}
                >
                  {hand.hint}
                </div>
              ) : null}
            </button>
          ))}
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
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
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
                className="mt-1 h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950"
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

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <h2 className="text-sm font-semibold">4. Honba sticks (optional)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          If there were repeat counters on the table from previous dealer wins or draws, add them here
          (usually 300 pts each; 900 total on tsumo).
        </p>
        <input
          type="number"
          min={0}
          max={20}
          value={honba}
          onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
          className="mt-2 h-11 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          aria-label="Honba sticks on table"
        />
      </section>

      {result ? (
        <section className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            You receive
          </div>
          <div className="mt-1 font-mono text-4xl font-bold tabular-nums tracking-tight text-emerald-950 dark:text-emerald-50">
            {result.total.toLocaleString()}
            <span className="ml-2 text-lg font-semibold text-emerald-800 dark:text-emerald-200">pts</span>
          </div>
          <div className="mt-2 text-sm text-emerald-900 dark:text-emerald-100">
            {winType === "ron" ? "Ron" : "Tsumo"} · {result.handLabel}
            {winnerIsDealer ? " · dealer win" : ""}
          </div>

          <div className="mt-4 rounded-xl bg-white/70 p-3 dark:bg-zinc-950/40">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Who pays</div>
            <ul className="mt-2 space-y-2">
              {result.payments.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 text-sm text-zinc-800 dark:text-zinc-100"
                >
                  <span>{row.label}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {row.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            {result.honbaNote ? (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{result.honbaNote}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-zinc-500">
        Uses standard riichi scoring (EMA-style han/fu tables). Fu is rounded up to the nearest 10.
        This tool helps at the table — for live games, use{" "}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">New game</span> to track scores
        automatically.
      </p>
    </div>
  );
}
