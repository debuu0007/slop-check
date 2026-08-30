import type { Finding, IndexedFunction, Rule } from "../types.js";
import { isIncluded, lineText, makeFinding } from "./shared.js";

export const id = "duplicate-helper";
export const displayName = "Déjà Vu";
export const weight = 0.12;
export const why = "Near-identical helpers multiply maintenance without adding behavior.";
export const roasts = ["This helper has been independently rediscovered.", "The repository already knew this one.", "Reuse was considered and then reimplemented.", "A familiar solution wearing a new function name."] as const;

function similarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

/**
 * Python cannot express one function that works in both sync and async contexts,
 * so every async library ships `f` beside `async_f` at 95% similarity. That pair
 * is a language constraint, not a helper someone rediscovered - and on an async
 * SDK it was most of what this rule reported.
 */
function asyncTwins(left: string, right: string): boolean {
  const bare = (name: string) => name.replace(/a?sync/gi, "").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return left !== right && bare(left) === bare(right) && bare(left).length > 0;
}

function sharesIdentifier(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const identifier of left) if (right.has(identifier)) return true;
  return false;
}

function candidatePositions(block: IndexedFunction, position: number, owners: ReadonlyMap<string, readonly number[]>): readonly number[] {
  let smallest: readonly number[] = [];
  for (const shingle of block.shingles) {
    const candidates = owners.get(shingle) ?? [];
    if (candidates.some((candidate) => candidate < position) && (!smallest.length || candidates.length < smallest.length)) smallest = candidates;
  }
  return smallest.filter((candidate) => candidate < position);
}

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, content, diff): Finding[] {
    const index = diff?.repoIndex;
    if (!index) return [];
    const findings: Finding[] = [];
    for (const block of index.functionsByPath.get(path) ?? []) {
      if (block.shingles.size < 25) continue;
      const duplicate = candidatePositions(block, block.position, index.shingleOwners).some((candidate) => {
        const other = index.functions[candidate];
        return other.name !== block.name && !asyncTwins(other.name, block.name) && other.shingles.size >= 25 && other.literalSignature === block.literalSignature && sharesIdentifier(block.identifiers, other.identifiers) && similarity(block.shingles, other.shingles) >= 0.85;
      });
      if (duplicate && isIncluded(block.line, diff)) findings.push(makeFinding(this, path, block.line, lineText(content, block.line)));
    }
    return findings;
  },
};
