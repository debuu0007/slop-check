import type { Finding, Rule } from "../types.js";
import { contentLines, isIncluded, lineNumberAt, lineText, makeFinding } from "./shared.js";
import { splitTopLevel } from "../repo-index.js";

export const id = "dead-defaults";
export const displayName = "The Ghost Param";
export const weight = 0.06;
export const why = "A default that no caller overrides presents flexibility nobody uses.";
export const roasts = [
  "Configurable in theory, ceremonial in practice.",
  "The parameter has options. Its callers do not.",
  "Flexibility has been added for an audience of zero.",
  "The default is also the only supported value.",
] as const;

/**
 * The claim "no caller overrides this" is only honest when the callers are all
 * visible. Three cases where they are not:
 *
 * A method reached through an interface, a subclass, or a framework has callers
 * the index cannot see. Abstract handlers and lifecycle hooks are the common case:
 * they are invoked by the framework holding the object, never by name, so every
 * optional parameter looks untouched. An indented declaration is the cheap,
 * reliable signal for that.
 *
 * Exported symbols are the same problem one level out, and it is the one that
 * mattered most in practice. A published package's callers are other people's
 * code; on an SDK this rule was reporting the entire public API as flexibility
 * nobody uses. A symbol has to be provably file-local - unexported in JS and TS,
 * underscore-prefixed by convention in Python - before absence of a call site
 * means anything at all.
 *
 * The third was measurement, in two parts. Call sites were split on bare commas,
 * so a comma inside a generic or a string literal invented parameters that were
 * never there; and only positional arity was compared, so `f(deep=True)` - the
 * ordinary way to override a keyword-only default - counted as not overriding it.
 * Both are fixed in the index, so a single observed call site is honest evidence.
 */
const MINIMUM_CALL_SITES = 1;

/** `*`, `/`, and the implicit receiver carry no default and must not shift the index. */
const MARKERS = new Set(["*", "/", "self", "cls"]);

function parameterName(parameter: string): string {
  return /^\**\s*([A-Za-z_$][\w$]*)/.exec(parameter)?.[1] ?? "";
}

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, content, diff) {
    const declaration = /(?:function\s+|def\s+)(\w+)\s*\(([^)]*=[^)]*)\)/g;
    const python = /\.py$/i.test(path);
    const lines = contentLines(content);
    const findings: Finding[] = [];
    for (const match of content.matchAll(declaration)) {
      const line = lineNumberAt(content, match.index ?? 0);
      const declarationLine = lines[line - 1] ?? "";
      // Indented declaration: a method or a closure, whose callers may be elsewhere.
      if (/^[ \t]+/.test(declarationLine)) continue;
      // Public API: the callers are outside this repository by construction.
      if (python ? !match[1].startsWith("_") : /\bexport\b/.test(declarationLine)) continue;
      const parameters = splitTopLevel(match[2]).filter((parameter) => !MARKERS.has(parameter));
      const firstDefault = parameters.findIndex((parameter) => /^[^=]+=(?!=)/.test(parameter));
      if (firstDefault < 0) continue;
      const optional = new Set(parameters.slice(firstDefault).map(parameterName).filter(Boolean));
      const calls = diff?.repoIndex?.callsByName.get(match[1])?.filter((call) => !call.declaration) ?? [];
      if (calls.length < MINIMUM_CALL_SITES) continue;
      const overridden = calls.some((call) => call.arity > firstDefault || [...call.keywords].some((keyword) => optional.has(keyword)));
      if (overridden) continue;
      if (isIncluded(line, diff)) findings.push(makeFinding(this, path, line, lineText(content, line)));
    }
    return findings;
  },
};
