import type { Rule } from "../types.js";
import { makeFinding } from "./shared.js";

export const id = "deletion-flag";
export const displayName = "The Vanishing";
export const weight = 0.2;
export const why = "Deleted tests, validation, or guards can remove safety without replacing it.";
export const roasts = [
  "The safety check has been optimized away.",
  "Less code. Also fewer guarantees.",
  "The guardrail was blocking the happy path.",
  "Coverage improved by reducing the things being covered.",
] as const;

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, _content, diff) {
    if (!diff?.deletedLines) return [];
    return diff.deletedLines
      .filter(({ text }) => /\b(?:test\w*|expect|assert\w*|validat\w*|guard\w*|feature[_-]?flag|process\.env|os\.environ|raise|throw)\b/i.test(text))
      .filter(({ text }) => !diff.repoIndex?.addedNormalizedLines.has(text.trim().replace(/\s+/g, " ")))
      .map(({ line, text }) => makeFinding(this, path, line, `- ${text.trim()}`));
  },
};
