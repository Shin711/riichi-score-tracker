"use client";

import { useMemo, useState } from "react";

import {
  calculateFu,
  defaultFuHelperInput,
  type FuHelperInput,
  type HandShape,
  type WaitType,
} from "@/lib/scoring/fuHelper";
import type { WinType } from "@/lib/scoring/hanFu";

function Stepper({
  label,
  hint,
  value,
  onChange,
  max = 4,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-2 dark:border-zinc-700">
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {hint ? <div className="text-[10px] text-zinc-500">{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-sm disabled:opacity-40 dark:border-zinc-600"
        >
          −
        </button>
        <span className="w-6 text-center font-mono text-sm tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-sm disabled:opacity-40 dark:border-zinc-600"
        >
          +
        </button>
      </div>
    </div>
  );
}

type FuHelperProps = {
  winType: WinType;
  onApply: (fu: number) => void;
};

export function FuHelper({ winType, onApply }: FuHelperProps) {
  const [open, setOpen] = useState(false);
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

  const showMelds = input.handShape === "normal";
  const showWait = input.handShape === "normal";

  return (
    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-3 dark:border-zinc-600 dark:bg-zinc-900/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Fu helper</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            Step-by-step fu count (standard riichi rules)
          </div>
        </div>
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Hand shape</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["normal", "Normal"],
                  ["pinfu", "Pinfu"],
                  ["chiitoitsu", "Seven pairs"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setHandShape(value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    input.handShape === value
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {input.handShape === "pinfu" ? (
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                All sequences + one pair, closed, no fu wait — fixed 20 fu (tsumo) or 30 fu (ron).
              </p>
            ) : null}
            {input.handShape === "chiitoitsu" ? (
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">Fixed 25 fu (not rounded).</p>
            ) : null}
          </div>

          {input.handShape === "normal" ? (
            <div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Hand open or closed?</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => patch({ isClosed: true })}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                    input.isClosed
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  Closed (concealed)
                </button>
                <button
                  type="button"
                  onClick={() => patch({ isClosed: false })}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                    !input.isClosed
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  Open (called chii/pon/kan)
                </button>
              </div>
            </div>
          ) : null}

          {showMelds ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">Melds (sets in hand)</div>
              <p className="text-[10px] text-zinc-500">
                Simple = tiles 2–8. Terminal/honor = 1, 9, winds, dragons. Chii (sequences) add 0 fu.
              </p>
              {!input.isClosed ? (
                <div className="space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Open (called)</div>
                  <Stepper
                    label="Open pon"
                    hint="2–8"
                    value={input.openPonSimple}
                    onChange={(n) => patch({ openPonSimple: n })}
                  />
                  <Stepper
                    label="Open pon"
                    hint="1 / 9 / honor"
                    value={input.openPonTerminalHonor}
                    onChange={(n) => patch({ openPonTerminalHonor: n })}
                  />
                  <Stepper
                    label="Open kan"
                    hint="2–8"
                    value={input.openKanSimple}
                    onChange={(n) => patch({ openKanSimple: n })}
                    max={1}
                  />
                  <Stepper
                    label="Open kan"
                    hint="1 / 9 / honor"
                    value={input.openKanTerminalHonor}
                    onChange={(n) => patch({ openKanTerminalHonor: n })}
                    max={1}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Concealed</div>
                <Stepper
                  label="Closed pon"
                  hint="2–8"
                  value={input.closedPonSimple}
                  onChange={(n) => patch({ closedPonSimple: n })}
                />
                <Stepper
                  label="Closed pon"
                  hint="1 / 9 / honor"
                  value={input.closedPonTerminalHonor}
                  onChange={(n) => patch({ closedPonTerminalHonor: n })}
                />
                <Stepper
                  label="Closed kan"
                  hint="2–8"
                  value={input.closedKanSimple}
                  onChange={(n) => patch({ closedKanSimple: n })}
                  max={1}
                />
                <Stepper
                  label="Closed kan"
                  hint="1 / 9 / honor"
                  value={input.closedKanTerminalHonor}
                  onChange={(n) => patch({ closedKanTerminalHonor: n })}
                  max={1}
                />
              </div>
            </div>
          ) : null}

          {showWait ? (
            <div>
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">How were you waiting?</div>
              <div className="mt-2 grid gap-1.5">
                {(
                  [
                    ["ryanmen", "Two-sided (e.g. 45 waiting on 3 or 6)", "0 fu"],
                    ["kanchan", "Middle gap (e.g. 13 waiting on 2)", "+2 fu"],
                    ["penchan", "Edge (e.g. 12 waiting on 3)", "+2 fu"],
                    ["tanki", "Completing a pair", "+2 fu"],
                    ["shanpon", "Two pairs (either pair completes)", "0 fu"],
                  ] as const
                ).map(([value, desc, fuTag]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patch({ waitType: value as WaitType })}
                    className={`rounded-lg border px-2 py-2 text-left text-xs ${
                      input.waitType === value
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <span className="font-medium">{desc}</span>
                    <span
                      className={`ml-1 ${input.waitType === value ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500"}`}
                    >
                      · {fuTag}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showMelds ? (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={input.valuedPair}
                onChange={(e) => patch({ valuedPair: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300"
              />
              <span>
                Pair is seat wind, round wind, or dragon <span className="text-zinc-500">(+2 fu)</span>
              </span>
            </label>
          ) : null}

          <div className="rounded-lg bg-white p-3 dark:bg-zinc-950">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">Total fu</span>
              <span className="font-mono text-2xl font-bold tabular-nums">{result.fu}</span>
            </div>
            <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              {result.lines.map((line, i) => (
                <li key={`${line.label}-${i}`} className="flex justify-between gap-2 text-[10px] text-zinc-600 dark:text-zinc-400">
                  <span>{line.label}</span>
                  {line.fu !== 0 ? (
                    <span className="font-mono tabular-nums">+{line.fu}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {result.warnings.map((w) => (
              <p key={w} className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              onApply(result.fu);
              setOpen(false);
            }}
            className="h-10 w-full rounded-lg bg-zinc-950 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
          >
            Use {result.fu} fu in calculator
          </button>
        </div>
      ) : null}
    </div>
  );
}
