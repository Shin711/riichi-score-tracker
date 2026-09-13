"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { findPlayerByDisplayName } from "@/lib/players/names";

export type ImportPlayerOption = { id: string; display_name: string };

export function resolveImportPlayerName(
  value: string,
  players: ImportPlayerOption[]
): { playerId: string; displayName: string } {
  const match = findPlayerByDisplayName(players, value);
  if (match) {
    return { playerId: match.id, displayName: match.display_name };
  }
  return { playerId: "", displayName: value };
}

function displayValue(
  playerId: string,
  displayName: string,
  players: ImportPlayerOption[]
) {
  if (playerId) {
    return players.find((p) => p.id === playerId)?.display_name ?? displayName;
  }
  return displayName;
}

export function ImportPlayerNameInput({
  players,
  playerId,
  displayName,
  onChange,
  onOpenChange,
  inputClassName = "field field-combobox h-11 w-full px-3 text-sm",
  listboxId = "import-player-listbox",
}: {
  players: ImportPlayerOption[];
  playerId: string;
  displayName: string;
  onChange: (patch: { playerId: string; displayName: string }) => void;
  onOpenChange?: (open: boolean) => void;
  inputClassName?: string;
  listboxId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimer = useRef<number | null>(null);
  const skipBlurResolveRef = useRef(false);
  const lastSelectedAtRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const value = displayValue(playerId, displayName, players);

  function setDropdownOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function clearBlurTimer() {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query
      ? players.filter((p) => p.display_name.toLowerCase().includes(query))
      : players;
    return (matches.length > 0 ? matches : players).slice(0, 12);
  }, [players, value]);

  function updatePlacement() {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportOffsetTop = viewport?.offsetTop ?? 0;
    const inputTop = rect.top - viewportOffsetTop;
    const inputBottom = rect.bottom - viewportOffsetTop;
    const spaceBelow = viewportHeight - inputBottom - 8;
    const spaceAbove = inputTop - 8;
    const minSpace = 120;
    setPlacement(spaceBelow < minSpace && spaceAbove > spaceBelow ? "above" : "below");
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updatePlacement);
    viewport?.addEventListener("scroll", updatePlacement);
    return () => {
      viewport?.removeEventListener("resize", updatePlacement);
      viewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [open, suggestions.length]);

  function handleFocus() {
    clearBlurTimer();
    setDropdownOpen(true);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest('[role="listbox"]')) return;

    if (skipBlurResolveRef.current) {
      skipBlurResolveRef.current = false;
      setDropdownOpen(false);
      return;
    }

    const current = e.target.value;
    blurTimer.current = window.setTimeout(() => {
      setDropdownOpen(false);
      if (skipBlurResolveRef.current || Date.now() - lastSelectedAtRef.current < 500) {
        skipBlurResolveRef.current = false;
        return;
      }
      onChange(resolveImportPlayerName(current, players));
    }, 200);
  }

  function selectPlayer(player: ImportPlayerOption) {
    clearBlurTimer();
    skipBlurResolveRef.current = true;
    lastSelectedAtRef.current = Date.now();
    onChange({ playerId: player.id, displayName: player.display_name });
    setDropdownOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (players.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setDropdownOpen(true);
        return;
      }
      setHighlightedIndex((i) => (suggestions.length === 0 ? -1 : (i + 1) % suggestions.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setDropdownOpen(true);
        return;
      }
      setHighlightedIndex((i) =>
        suggestions.length === 0 ? -1 : i <= 0 ? suggestions.length - 1 : i - 1
      );
    } else if (e.key === "Enter") {
      if (open && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        selectPlayer(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    }
  }

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <div className="relative min-w-0">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(resolveImportPlayerName(e.target.value, players));
          setDropdownOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          highlightedIndex >= 0 && highlightedIndex < suggestions.length
            ? `${listboxId}-option-${suggestions[highlightedIndex].id}`
            : undefined
        }
        placeholder="Player name"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        className={inputClassName}
      />
      {open && players.length > 0 ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={`combobox-dropdown absolute left-0 z-[100] max-h-52 w-full touch-manipulation overflow-y-auto overscroll-contain rounded-xl border border-club-border py-1 shadow-xl ${
            placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {suggestions.map((player, index) => {
            const isHighlighted = index === highlightedIndex;
            const isSelected = player.id === playerId;
            return (
              <li
                key={player.id}
                id={`${listboxId}-option-${player.id}`}
                role="option"
                aria-selected={isHighlighted || isSelected}
              >
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    selectPlayer(player);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`block w-full px-3 py-2.5 text-left text-sm ${
                    isHighlighted
                      ? "bg-club-red-muted text-club-ink"
                      : isSelected
                        ? "bg-club-red-muted font-medium text-club-ink"
                        : "text-club-ink"
                  }`}
                >
                  {player.display_name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
