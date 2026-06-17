"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FuHelper } from "@/components/FuHelper";
import {
  calculateHandScore,
  calculateRonPointsScore,
  HAND_SCENARIOS,
  previewScenarioTotal,
  RON_POINT_PRESETS,
  scoreScenario,
} from "@/lib/scoring/calculatorDisplay";
import type { WinType } from "@/lib/scoring/hanFu";

type CalcMode = "scenario" | "points" | "advanced";

function PillRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors ${
            value === opt.value
              ? "border-club-red bg-club-red text-white shadow-sm shadow-club-red/20"
              : "border-club-border text-club-ink hover:border-stone-400 dark:hover:border-stone-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ScoreCalculator() {
  const [winType, setWinType] = useState<WinType>("tsumo");
  const [winnerIsDealer, setWinnerIsDealer] = useState(false);
  const [honba, setHonba] = useState(0);
  const [mode, setMode] = useState<CalcMode>("scenario");
  const [scenarioId, setScenarioId] = useState("riichi");
  const [han, setHan] = useState(2);
  const [fu, setFu] = useState(30);
  const [ronPoints, setRonPoints] = useState<number | null>(null);

  const result = useMemo(() => {
    if (mode === "points" && winType === "ron" && ronPoints != null) {
      return calculateRonPointsScore(ronPoints, honba);
    }
    if (mode === "advanced") {
      return calculateHandScore({ winType, winnerIsDealer, han, fu, honba });
    }
    const scenario = HAND_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    return scoreScenario(scenario, winType, winnerIsDealer, honba);
  }, [mode, winType, winnerIsDealer, honba, scenarioId, han, fu, ronPoints]);

  function pickScenario(id: string) {
    setMode("scenario");
    setRonPoints(null);
    setScenarioId(id);
  }

  function pickRonPoints(points: number) {
    setMode("points");
    setRonPoints(points);
  }

  return (
    <div className="space-y-4">
      {result ? (
        <section className="jade-panel sticky top-16 z-30 p-4 shadow-md sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="jade-panel-label">You receive</span>
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-white/90 dark:bg-white/10">
              {winType === "ron" ? "Ron" : "Tsumo"}
              {winnerIsDealer ? " · Dealer" : ""}
            </span>
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-white/90 dark:bg-white/10">
              {result.handLabel}
            </span>
            {honba > 0 ? (
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-white/90 dark:bg-white/10">
                {honba} honba
              </span>
            ) : null}
          </div>
          <div className="jade-panel-fg mt-1.5 font-mono text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
            {result.total.toLocaleString()}
            <span className="jade-panel-label ml-2 text-lg font-semibold normal-case">pts</span>
          </div>

          <div className="card mt-4 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Who pays</div>
            <ul className="mt-2 space-y-1.5">
              {result.payments.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 text-sm text-club-ink"
                >
                  <span>{row.label}</span>
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {row.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            {result.honbaNote ? <p className="text-muted mt-2 text-xs">{result.honbaNote}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold">Win type</h2>
          <div className="mt-2">
            <PillRow
              value={winType}
              onChange={(v) => {
                setWinType(v);
                if (mode === "points" && v !== "ron") {
                  setMode("scenario");
                  setRonPoints(null);
                }
              }}
              options={[
                { value: "tsumo", label: "Tsumo (self-draw)" },
                { value: "ron", label: "Ron" },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Dealer?</h2>
          <div className="mt-2">
            <PillRow
              value={winnerIsDealer ? "yes" : "no"}
              onChange={(v) => {
                const dealer = v === "yes";
                setWinnerIsDealer(dealer);
                // Exact-total presets are non-dealer values, so leave points mode when becoming dealer.
                if (dealer && mode === "points") {
                  setMode("scenario");
                  setRonPoints(null);
                }
              }}
              options={[
                { value: "no", label: "Not dealer" },
                { value: "yes", label: "I am dealer" },
              ]}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Common hands</h2>
          <p className="text-muted mt-1 text-xs">
            Tap your hand — amounts update for ron/tsumo and dealer. Self-draws include menzen tsumo
            automatically.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {HAND_SCENARIOS.map((scenario) => {
              const preview = previewScenarioTotal(scenario, winType, winnerIsDealer, honba);
              const active = mode === "scenario" && scenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => pickScenario(scenario.id)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-club-red bg-club-red text-white shadow-sm shadow-club-red/20"
                      : "border-club-border text-club-ink hover:border-stone-400 dark:hover:border-stone-500"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{scenario.label}</div>
                    {scenario.hint ? (
                      <div className={`text-xs ${active ? "text-white/85" : "text-subtle"}`}>
                        {scenario.hint}
                      </div>
                    ) : null}
                  </div>
                  {preview != null ? (
                    <span
                      className={`shrink-0 font-mono text-base font-bold tabular-nums ${
                        active ? "text-white" : "text-club-gold"
                      }`}
                    >
                      {preview.toLocaleString()}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Honba sticks</h2>
          <p className="text-muted mt-1 text-xs">
            Repeat counters on the table — +300 per stick (all from the discarder on ron; 100 from each
            player on tsumo).
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setHonba(n)}
                className={`h-10 min-w-10 rounded-full border px-3 text-sm font-medium ${
                  honba === n
                    ? "border-club-red bg-club-red text-white"
                    : "border-club-border text-club-ink"
                }`}
              >
                {n}
              </button>
            ))}
            <label className="flex items-center gap-2 text-xs text-muted">
              <span>More</span>
              <input
                type="number"
                inputMode="numeric"
                min={4}
                max={20}
                value={honba >= 4 ? honba : ""}
                placeholder="4+"
                onChange={(e) => setHonba(Math.max(0, Number(e.target.value) || 0))}
                className="field h-10 w-16 px-2 text-base"
                aria-label="Honba sticks (4 or more)"
              />
            </label>
          </div>
        </div>
      </section>

      {winType === "ron" && !winnerIsDealer ? (
        <details className="card group p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold text-club-ink marker:text-muted">
            I know the exact ron total (e.g. from Mahjong Soul)
          </summary>
          <p className="text-muted mt-2 text-xs">
            Tap the total shown on your app. Honba above is added automatically.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {RON_POINT_PRESETS.map((points) => {
              const active = mode === "points" && ronPoints === points;
              const withHonba = points + honba * 300;
              return (
                <button
                  key={points}
                  type="button"
                  onClick={() => pickRonPoints(points)}
                  className={`rounded-lg border px-2 py-2.5 font-mono text-sm font-semibold tabular-nums ${
                    active
                      ? "border-club-red bg-club-red text-white"
                      : "border-club-border text-club-ink"
                  }`}
                >
                  {honba > 0 ? withHonba.toLocaleString() : points.toLocaleString()}
                </button>
              );
            })}
          </div>
        </details>
      ) : null}

      <details className="card group p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-club-ink marker:text-muted">
          Advanced — custom han & fu
        </summary>
        <p className="text-muted mt-2 text-xs">
          Use when your hand is not in the list above. Fu is rounded up to the nearest 10.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs">
            Han
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={han}
              onChange={(e) => {
                setMode("advanced");
                setRonPoints(null);
                setHan(Math.max(1, Number(e.target.value) || 1));
              }}
              className="field mt-1 h-11 w-full px-2 text-base"
            />
          </label>
          <label className="text-xs">
            Fu {han >= 5 ? "(limit hand)" : ""}
            <input
              type="number"
              inputMode="numeric"
              min={20}
              max={110}
              step={10}
              value={fu}
              disabled={han >= 5}
              onChange={(e) => {
                setMode("advanced");
                setRonPoints(null);
                setFu(Number(e.target.value) || 30);
              }}
              className="field mt-1 h-11 w-full px-2 text-base disabled:opacity-50"
            />
          </label>
        </div>
        <FuHelper
          winType={winType}
          onApply={({ fu: computedFu, han: computedHan }) => {
            setMode("advanced");
            setRonPoints(null);
            setFu(computedFu);
            if (computedHan != null) setHan(computedHan);
          }}
        />
      </details>

      <p className="text-muted text-xs leading-relaxed">
        Finished for the night?{" "}
        <Link href="/import" className="font-medium text-club-ink underline">
          Import your game
        </Link>{" "}
        to update the monthly leaderboard. Standard EMA-style scoring.
      </p>
    </div>
  );
}
