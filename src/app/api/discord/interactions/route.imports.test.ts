/**
 * Guards the Discord interactions bundle against heavy native deps.
 *
 * Discord must reply within three seconds and cannot defer a modal. Importing
 * the daily poster (wasm solver + sharp) into this route is what made the
 * first Answer click of the day fail with "This interaction failed".
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not find repo root from test file.");
})();
const ENTRY = path.join(REPO_ROOT, "src/app/api/discord/interactions/route.ts");

const FORBIDDEN = [
  "riichi-rs-node",
  "sharp",
  "@/lib/quiz/daily",
  "@/lib/quiz/generate",
  "@/lib/quiz/solve",
  "@/lib/quiz/handImage",
  "@/lib/discord/quizMessage",
  "@/lib/discord/tileEmoji",
  "@/lib/discord/bot",
];

const FROM_RE =
  /(?:^|\n)\s*(?:import|export)(\s+type)?\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function isTypeOnlySpecifiers(spec: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed.startsWith("{")) return false;
  const close = trimmed.lastIndexOf("}");
  if (close < 0) return false;
  const inner = trimmed.slice(1, close);
  const parts = inner
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s/.test(part));
}

function valueImports(source: string): string[] {
  const code = stripComments(source);
  const specs: string[] = [];
  for (const match of code.matchAll(FROM_RE)) {
    const typeKeyword = match[1];
    const specifiers = match[2] ?? "";
    const from = match[3];
    if (typeKeyword) continue;
    if (isTypeOnlySpecifiers(specifiers)) continue;
    specs.push(from);
  }
  for (const match of code.matchAll(BARE_IMPORT_RE)) {
    specs.push(match[1]);
  }
  return specs;
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    return path.join(REPO_ROOT, "src", spec.slice(2));
  }
  if (spec.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), spec);
  }
  return null;
}

function existingFile(resolved: string): string | null {
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) return withExt;
  }
  const index = path.join(resolved, "index.ts");
  if (fs.existsSync(index)) return index;
  return null;
}

function collectGraph(entry: string): { files: string[]; packages: string[] } {
  const files: string[] = [];
  const packages: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(path.relative(REPO_ROOT, file));

    const source = fs.readFileSync(file, "utf8");
    for (const spec of valueImports(source)) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) {
        packages.push(spec);
        continue;
      }
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;
      const existing = existingFile(resolved);
      if (existing) queue.push(existing);
    }
  }

  return { files, packages };
}

describe("discord interactions import graph", () => {
  it("does not pull the wasm solver, sharp, or the daily poster", () => {
    const { files, packages } = collectGraph(ENTRY);
    const reachable = [...files, ...packages];

    const hits = FORBIDDEN.filter((name) =>
      reachable.some(
        (item) =>
          item === name ||
          item === name.replace("@/", "src/") + ".ts" ||
          item.endsWith(`/${name}`) ||
          item.includes(`${name}/`)
      )
    );

    assert.deepEqual(
      hits,
      [],
      `interactions route reached forbidden modules:\n${reachable.sort().join("\n")}`
    );
  });
});
