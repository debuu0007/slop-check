import type { Rule } from "../types.js";
import { closingBrace, isIncluded, lineNumberAt, lineText, makeFinding } from "./shared.js";

export const id = "empty-catch";
export const displayName = "The Silencer";
export const weight = 0.16;
export const why = "An error handler that cannot affect behavior only hides evidence; Python pass handlers are covered by The Gulp.";
export const roasts = [
  "Nothing happened, officially.",
  "The error was handled into nonexistence.",
  "Observability has left the chat.",
  "A flawless record, maintained by shredding the reports.",
] as const;

const commentPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
/** A marker is a note to self, not a reason. */
const markerOnly = /^(?:TODO|FIXME|XXX|HACK|NOTE)\b[\s:.-]*$/i;

/**
 * An empty catch with a comment explaining why is a decision; an empty catch with
 * nothing in it is a shrug. The rule used to strip comments before testing for
 * emptiness, which scored the two identically. Deliberate best-effort cleanup is
 * routinely written this way - annotated precisely because the author knew the
 * silence needed justifying - and every one of those was reported as a failure.
 */
function isExplained(body: string): boolean {
  for (const match of body.matchAll(commentPattern)) {
    const text = match[0].replace(/^\/\*+|\*+\/$|^\/\/+/g, "").replace(/^\s*\*+/gm, "").trim();
    if (text.length >= 8 && /[a-z]{3}/i.test(text) && !markerOnly.test(text)) return true;
  }
  return false;
}

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, content, diff) {
    if (/\.py$/i.test(path)) return [];
    const findings = [];
    const regex = /catch\s*(?:\([^)]*\))?\s*\{/g;
    for (const match of content.matchAll(regex)) {
      const opening = (match.index ?? 0) + match[0].lastIndexOf("{");
      const closing = closingBrace(content, opening);
      if (closing < 0) continue;
      const raw = content.slice(opening + 1, closing);
      if (isExplained(raw)) continue;
      const body = raw.replace(commentPattern, "").trim();
      if (body && !/^(?:console\.(?:log|debug|warn)\([^;]*\);?\s*)+$/.test(body)) continue;
      const line = lineNumberAt(content, match.index ?? 0);
      if (isIncluded(line, diff)) findings.push(makeFinding(this, path, line, lineText(content, line)));
    }
    return findings;
  },
};
