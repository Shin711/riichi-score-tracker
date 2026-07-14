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
  scenarioAcceptsExtras,
  scoreScenario,
  type ScenarioExtras,
} from "@/lib/scoring/calculatorDisplay";
import type { WinType } from "@/lib/scoring/hanFu";

type CalcMode = "scenario" | "points" | "advanced";

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function NumericField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="text-xs">
      {label}
      {hint ? ` ${hint}` : ""}
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "");
          setDraft(next);
          if (next !== "") onCommit(clampInt(Number(next), min, max));
        }}
        onBlur={() => {
          const parsed = draft === "" || draft == null ? value : Number(draft);
          onCommit(clampInt(Number.isFinite(parsed) ? parsed : value, min, max));
          setDraft(null);
        }}
        className="field mt-1 block h-11 w-full px-3 text-base tabular-nums disabled:opacity-50"
      />
    </label>
  );
}

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
          className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-all duration-300 ease-fluid ${
            value === opt.value
              ? "scale-[1.02] border-club-red bg-club-red text-white shadow-md shadow-club-red/25"
              : "border-club-border text-club-ink hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-sm dark:hover:border-stone-500"
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
  const [dora, setDora] = useState(0);
  const [ippatsu, setIppatsu] = useState(false);

  const extras = useMemo<ScenarioExtras>(() => ({ dora, ippatsu }), [dora, ippatsu]);
  const activeScenario = HAND_SCENARIOS.find((s) => s.id === scenarioId) ?? null;
  const extrasApply =
    mode === "scenario" && activeScenario != null && scenarioAcceptsExtras(activeScenario);

  const result = useMemo(() => {
    if (mode === "points" && winType === "ron" && ronPoints != null) {
      return calculateRonPointsScore(ronPoints, honba);
    }
    if (mode === "advanced") {
      return calculateHandScore({ winType, winnerIsDealer, han, fu, honba });
    }
    const scenario = HAND_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return null;
    return scoreScenario(scenario, winType, winnerIsDealer, honba, extras);
  }, [mode, winType, winnerIsDealer, honba, scenarioId, han, fu, ronPoints, extras]);

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
    <div className="space-y-5">
      {result ? (
        <section className="calc-result p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-club-jade/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="calc-result-label">You receive</span>
            <span className="calc-result-chip">
              {winType === "ron" ? "Ron" : "Tsumo"}
              {winnerIsDealer ? " · Dealer" : ""}
            </span>
            <span className="calc-result-chip">{result.handLabel}</span>
            {extrasApply && dora > 0 ? (
              <span className="calc-result-chip">
                +{dora} dora
              </span>
            ) : null}
            {extrasApply && ippatsu ? <span className="calc-result-chip">Ippatsu</span> : null}
            {honba > 0 ? <span className="calc-result-chip">{honba} honba</span> : null}
          </div>
          <div
            key={result.total}
            className="score-display score-pop calc-result-total mt-2"
          >
            {result.total.toLocaleString()}
            <span className="calc-result-unit">pts</span>
          </div>

          <div className="calc-breakdown card mt-4 p-3.5">
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

      <section className="card space-y-5 p-4 sm:p-6">
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
            automatically. Add dora below and the totals update.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {HAND_SCENARIOS.map((scenario) => {
              const preview = previewScenarioTotal(
                scenario,
                winType,
                winnerIsDealer,
                honba,
                scenarioAcceptsExtras(scenario) ? extras : undefined
              );
              const active = mode === "scenario" && scenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => pickScenario(scenario.id)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-300 ease-fluid ${
                    active
                      ? "scale-[1.01] border-club-red bg-club-red text-white shadow-md shadow-club-red/30"
                      : "border-club-border text-club-ink hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md dark:hover:border-stone-500"
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
          <h2 className="text-sm font-semibold">Dora &amp; ippatsu</h2>
          <p className="text-muted mt-1 text-xs">
            Count everything together: dora + ura dora + red fives. Each is +1 han on top of the
            hand picked above.
          </p>
          {mode === "scenario" && activeScenario != null && !scenarioAcceptsExtras(activeScenario) ? (
            <p className="mt-2 rounded-lg bg-club-gold-muted px-3 py-2 text-xs text-club-gold">
              {activeScenario.label} is already a final tier — dora is counted in it, so the picker
              below is ignored. Pick a riichi hand above to stack dora.
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setDora(n);
                  if (mode !== "scenario") {
                    setMode("scenario");
                    setRonPoints(null);
                  }
                }}
                className={`h-10 min-w-10 rounded-full border px-3 text-sm font-medium ${
                  dora === n
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
                type="text"
                inputMode="numeric"
                value={dora >= 7 ? String(dora) : ""}
                placeholder="7+"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  if (digits === "") {
                    setDora(0);
                  } else {
                    setDora(Math.max(0, Number(digits)));
                  }
                  if (mode !== "scenario") {
                    setMode("scenario");
                    setRonPoints(null);
                  }
                }}
                className="field h-10 w-16 px-2 text-base tabular-nums"
                aria-label="Dora count (7 or more)"
              />
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-club-border px-3 py-3">
            <input
              type="checkbox"
              checked={ippatsu}
              onChange={(e) => {
                setIppatsu(e.target.checked);
                if (mode !== "scenario") {
                  setMode("scenario");
                  setRonPoints(null);
                }
              }}
              className="h-4 w-4 rounded border-club-border"
            />
            <span className="text-sm text-club-ink">
              Ippatsu — won within one turn of riichi <span className="text-subtle">(+1 han)</span>
            </span>
          </label>
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
                type="text"
                inputMode="numeric"
                value={honba >= 4 ? String(honba) : ""}
                placeholder="4+"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setHonba(digits === "" ? 0 : Math.max(0, Number(digits)));
                }}
                className="field h-10 w-16 px-2 text-base tabular-nums"
                aria-label="Honba sticks (4 or more)"
              />
            </label>
          </div>
        </div>
      </section>

      {winType === "ron" && !winnerIsDealer ? (
        <details className="card group p-4 sm:p-6">
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

      <details className="card group p-4 sm:p-6">
        <summary className="cursor-pointer text-sm font-semibold text-club-ink marker:text-muted">
          Advanced — custom han & fu
        </summary>
        <p className="text-muted mt-2 text-xs">
          Use when your hand is not in the list above. Count dora into the han number here. Fu is
          rounded up to the nearest 10.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumericField
            label="Han"
            value={han}
            min={1}
            max={99}
            onCommit={(next) => {
              setMode("advanced");
              setRonPoints(null);
              setHan(next);
            }}
          />
          <NumericField
            label="Fu"
            hint={han >= 5 ? "(limit hand)" : undefined}
            value={fu}
            min={20}
            max={110}
            disabled={han >= 5}
            onCommit={(next) => {
              setMode("advanced");
              setRonPoints(null);
              setFu(next);
            }}
          />
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
