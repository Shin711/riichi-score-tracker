"use client";

import { useMemo, useState } from "react";

import {
  calculateFu,
  defaultFuHelperInput,
  type FuHelperInput,
  type HandShape,
} from "@/lib/scoring/fuHelper";
import type { WinType } from "@/lib/scoring/hanFu";

export type FuHelperApply = {
  fu: number;
  /** Set when using a quick han+fu preset; omit when only fu was calculated. */
  han?: number;
};

type FuHelperProps = {
  winType: WinType;
  onApply: (result: FuHelperApply) => void;
};

/** One-tap han+fu combos — most club hands at the table. */
const QUICK_PRESETS: Array<{ han: number; fu: number; label: string; hint: string }> = [
  { han: 1, fu: 30, label: "1 han · 30 fu", hint: "Riichi only (most common)" },
  { han: 1, fu: 40, label: "1 han · 40 fu", hint: "Riichi, closed ron or yakuhai pon" },
  { han: 1, fu: 50, label: "1 han · 50 fu", hint: "Fu-heavy riichi" },
  { han: 2, fu: 30, label: "2 han · 30 fu", hint: "Riichi + tanyao" },
  { han: 2, fu: 40, label: "2 han · 40 fu", hint: "Riichi + yakuhai" },
  { han: 3, fu: 30, label: "3 han · 30 fu", hint: "e.g. + 1 dora" },
];

function CountPills({
  value,
  max,
  allowedMax,
  onChange,
}: {
  value: number;
  max: number;
  /** Highest value selectable given the remaining 4-set budget. */
  allowedMax?: number;
  onChange: (n: number) => void;
}) {
  const cap = allowedMax ?? max;
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: max + 1 }, (_, n) => {
        const disabled = n > cap && n !== value;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`flex h-10 min-w-10 flex-1 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors sm:flex-none ${
              value === n
                ? "border-club-red bg-club-red text-white"
                : disabled
                  ? "border-club-border/60 text-subtle opacity-40"
                  : "border-club-border text-club-ink hover:border-stone-400 dark:hover:border-stone-500"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function MeldCounter({
  label,
  fuEach,
  value,
  remaining,
  hardMax = 4,
  onChange,
}: {
  label: string;
  fuEach: number;
  value: number;
  /** Sets still available in the 4-set budget (excluding this counter's value). */
  remaining: number;
  hardMax?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-xs text-club-ink">{label}</div>
        <div className="text-[11px] text-subtle">+{fuEach} fu each</div>
      </div>
      <CountPills value={value} max={hardMax} allowedMax={value + remaining} onChange={onChange} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-club-ink">{children}</div>;
}

export function FuHelper({ winType, onApply }: FuHelperProps) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [kanOpen, setKanOpen] = useState(false);
  const [input, setInput] = useState<FuHelperInput>(() => defaultFuHelperInput(winType));

  const syncedInput = useMemo(() => ({ ...input, winType }), [input, winType]);
  const result = useMemo(() => calculateFu(syncedInput), [syncedInput]);

  function patch(partial: Partial<FuHelperInput>) {
    setInput((prev) => ({ ...prev, ...partial }));
  }

  function setHandShape(shape: HandShape) {
    if (shape === "pinfu" || shape === "chiitoitsu") {
      patch({
        handShape: shape,
        isClosed: true,
        openPonSimple: 0,
        openPonTerminalHonor: 0,
        openKanSimple: 0,
        openKanTerminalHonor: 0,
        waitType: "ryanmen",
      });
      return;
    }
    patch({ handShape: shape });
  }

  function applyPreset(preset: (typeof QUICK_PRESETS)[number]) {
    onApply({ han: preset.han, fu: preset.fu });
  }

  function applyBuilt() {
    onApply({ fu: result.fu });
  }

  const pinfuFu = winType === "tsumo" ? 20 : 30;

  const meldTotal =
    input.closedPonSimple +
    input.closedPonTerminalHonor +
    input.openPonSimple +
    input.openPonTerminalHonor +
    input.closedKanSimple +
    input.closedKanTerminalHonor +
    input.openKanSimple +
    input.openKanTerminalHonor;
  const kanTotal =
    input.closedKanSimple +
    input.closedKanTerminalHonor +
    input.openKanSimple +
    input.openKanTerminalHonor;
  // A standard hand is 4 sets + 1 pair, so triplets + kans can never exceed 4.
  const remaining = Math.max(0, 4 - meldTotal);

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-club-border bg-club-surface p-4">
      <div>
        <SectionLabel>Quick han & fu</SectionLabel>
        <p className="text-muted mt-1 text-xs">Tap a common combo — sets both han and fu in the calculator.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={`${preset.han}-${preset.fu}`}
              type="button"
              onClick={() => applyPreset(preset)}
              className="flex items-center justify-between gap-2 rounded-xl border border-club-border px-3 py-3 text-left transition-colors hover:border-stone-400 dark:hover:border-stone-500"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-club-ink">{preset.label}</div>
                <div className="text-xs text-subtle">{preset.hint}</div>
              </div>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-club-gold">
                {preset.fu}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-club-border pt-4">
        <button
          type="button"
          onClick={() => setBuilderOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <SectionLabel>Count fu step by step</SectionLabel>
            <p className="text-muted mt-1 text-xs">
              Only when quick picks do not fit. Han stays whatever you set above.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-muted">{builderOpen ? "Hide" : "Show"}</span>
        </button>

        {builderOpen ? (
          <div className="mt-4 space-y-5">
            <div className="jade-panel p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="jade-panel-label">Calculated fu</span>
                <span className="jade-panel-fg font-mono text-3xl font-bold tabular-nums">{result.fu}</span>
              </div>
              {result.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {result.warnings.map((w) => (
                    <li key={w} className="text-xs text-amber-700 dark:text-amber-300">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div>
              <SectionLabel>Hand shape</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["normal", "Normal"],
                    ["pinfu", `Pinfu (${pinfuFu} fu)`],
                    ["chiitoitsu", "Seven pairs (25 fu)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHandShape(value)}
                    className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${
                      input.handShape === value
                        ? "border-club-red bg-club-red text-white"
                        : "border-club-border text-club-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {input.handShape === "normal" ? (
              <>
                <div>
                  <SectionLabel>Called any tiles?</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          isClosed: true,
                          openPonSimple: 0,
                          openPonTerminalHonor: 0,
                          openKanSimple: 0,
                          openKanTerminalHonor: 0,
                        })
                      }
                      className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-medium ${
                        input.isClosed
                          ? "border-club-red bg-club-red text-white"
                          : "border-club-border text-club-ink"
                      }`}
                    >
                      No — closed hand
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ isClosed: false })}
                      className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-medium ${
                        !input.isClosed
                          ? "border-club-red bg-club-red text-white"
                          : "border-club-border text-club-ink"
                      }`}
                    >
                      Yes — open hand
                    </button>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-club-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel>Triplets &amp; kans</SectionLabel>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                        remaining === 0
                          ? "bg-club-gold-muted text-club-gold"
                          : "bg-club-surface text-subtle"
                      }`}
                    >
                      {meldTotal} / 4 sets
                    </span>
                  </div>
                  <p className="text-muted text-xs">
                    Sequences (runs) add 0 fu — only count triplets and kans. A hand has 4 sets total, so
                    pick at most 4.
                  </p>

                  <div className="space-y-3">
                    <MeldCounter
                      label="Concealed triplet — simples (2–8)"
                      fuEach={4}
                      value={input.closedPonSimple}
                      remaining={remaining}
                      onChange={(n) => patch({ closedPonSimple: n })}
                    />
                    <MeldCounter
                      label="Concealed triplet — terminals / honors"
                      fuEach={8}
                      value={input.closedPonTerminalHonor}
                      remaining={remaining}
                      onChange={(n) => patch({ closedPonTerminalHonor: n })}
                    />
                    {!input.isClosed ? (
                      <>
                        <MeldCounter
                          label="Called triplet (pon) — simples (2–8)"
                          fuEach={2}
                          value={input.openPonSimple}
                          remaining={remaining}
                          onChange={(n) => patch({ openPonSimple: n })}
                        />
                        <MeldCounter
                          label="Called triplet (pon) — terminals / honors"
                          fuEach={4}
                          value={input.openPonTerminalHonor}
                          remaining={remaining}
                          onChange={(n) => patch({ openPonTerminalHonor: n })}
                        />
                      </>
                    ) : null}
                  </div>

                  <div className="border-t border-club-border pt-3">
                    <button
                      type="button"
                      onClick={() => setKanOpen((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-xs font-medium text-muted">
                        Have a kan? <span className="text-subtle">(rare)</span>
                        {kanTotal > 0 ? (
                          <span className="ml-1 text-club-gold">· {kanTotal} added</span>
                        ) : null}
                      </span>
                      <span className="text-xs font-medium text-muted">{kanOpen ? "Hide" : "Show"}</span>
                    </button>
                    {kanOpen ? (
                      <div className="mt-3 space-y-3">
                        <MeldCounter
                          label="Concealed kan — simples (2–8)"
                          fuEach={16}
                          value={input.closedKanSimple}
                          remaining={remaining}
                          hardMax={4}
                          onChange={(n) => patch({ closedKanSimple: n })}
                        />
                        <MeldCounter
                          label="Concealed kan — terminals / honors"
                          fuEach={32}
                          value={input.closedKanTerminalHonor}
                          remaining={remaining}
                          hardMax={4}
                          onChange={(n) => patch({ closedKanTerminalHonor: n })}
                        />
                        {!input.isClosed ? (
                          <>
                            <MeldCounter
                              label="Called kan — simples (2–8)"
                              fuEach={8}
                              value={input.openKanSimple}
                              remaining={remaining}
                              hardMax={4}
                              onChange={(n) => patch({ openKanSimple: n })}
                            />
                            <MeldCounter
                              label="Called kan — terminals / honors"
                              fuEach={16}
                              value={input.openKanTerminalHonor}
                              remaining={remaining}
                              hardMax={4}
                              onChange={(n) => patch({ openKanTerminalHonor: n })}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <SectionLabel>Winning tile wait</SectionLabel>
                  <p className="text-muted mt-1 text-xs">
                    Only the +2 distinction matters — edge, middle-gap, and pair waits all add the same 2 fu.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => patch({ waitType: "ryanmen" })}
                      className={`rounded-xl border px-3 py-3 text-left ${
                        input.waitType === "ryanmen" || input.waitType === "shanpon"
                          ? "border-club-red bg-club-red text-white"
                          : "border-club-border text-club-ink"
                      }`}
                    >
                      <div className="text-sm font-semibold">Two-sided / dual-pair</div>
                      <div
                        className={`text-xs ${
                          input.waitType === "ryanmen" || input.waitType === "shanpon"
                            ? "text-white/85"
                            : "text-subtle"
                        }`}
                      >
                        Ryanmen or shanpon · 0 fu
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ waitType: "kanchan" })}
                      className={`rounded-xl border px-3 py-3 text-left ${
                        input.waitType !== "ryanmen" && input.waitType !== "shanpon"
                          ? "border-club-red bg-club-red text-white"
                          : "border-club-border text-club-ink"
                      }`}
                    >
                      <div className="text-sm font-semibold">Edge, middle, or pair</div>
                      <div
                        className={`text-xs ${
                          input.waitType !== "ryanmen" && input.waitType !== "shanpon"
                            ? "text-white/85"
                            : "text-subtle"
                        }`}
                      >
                        Penchan, kanchan, or tanki · +2 fu
                      </div>
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-club-border px-3 py-3">
                  <input
                    type="checkbox"
                    checked={input.valuedPair}
                    onChange={(e) => patch({ valuedPair: e.target.checked })}
                    className="h-4 w-4 rounded border-club-border"
                  />
                  <span className="text-sm text-club-ink">
                    Pair is your seat wind, round wind, or dragon{" "}
                    <span className="text-subtle">(+2 fu)</span>
                  </span>
                </label>
              </>
            ) : null}

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-muted">Show fu breakdown</summary>
              <ul className="mt-2 space-y-1 rounded-lg border border-club-border p-3">
                {result.lines.map((line, i) => (
                  <li key={`${line.label}-${i}`} className="flex justify-between gap-2 text-muted">
                    <span>{line.label}</span>
                    {line.fu !== 0 ? <span className="font-mono tabular-nums">+{line.fu}</span> : null}
                  </li>
                ))}
              </ul>
            </details>

            <button type="button" onClick={applyBuilt} className="btn-primary h-11 w-full">
              Use {result.fu} fu in calculator
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
