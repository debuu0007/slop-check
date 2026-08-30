import type { Finding, Rule } from "../types.js";
import { contentLines, isIncluded, lineText, makeFinding, maskComments } from "./shared.js";

export const id = "happy-path-only";
export const displayName = "Sunshine Code";
export const weight = 0.12;
export const why = "Fallible async or I/O work has no visible failure path.";
export const roasts = [
  "The network has promised to behave.",
  "Every dependency is healthy in this work of fiction.",
  "The unhappy path was not invited to the demo.",
  "Failure handling is scheduled immediately after success.",
] as const;

const ioPattern = /\b(?:await\s+)?(?:fetch|axios\.(?:get|post|put|delete)|fs\.(?:read|write)|readFile|writeFile|requests\.(?:get|post|put|delete)|urllib\.request\.urlopen)\s*\(/;
/**
 * `\bopen(` also matches `tarfile.open(`, `Path(...).open(`, and `wave.open(` -
 * any method that happens to be named open, on any object. Only the builtin is
 * evidence of unguarded file I/O.
 */
const pythonOpenPattern = /(?<![.\w])open\s*\(/;
/**
 * A `with` block is the failure path. The context manager guarantees the cleanup
 * a try/finally would have written by hand, and letting the error propagate to the
 * caller is correct in a library rather than an omission. Reading every
 * `with open(...)` as unhandled I/O made this rule fire on idiomatic Python.
 */
const contextManagerPattern = /^\s*(?:async\s+)?with\b/;
/**
 * A method named `fetch` or `open` is a declaration, not a call to one. Without
 * this, an HTTP client library is flagged once for every method it defines -
 * every wrapper around fetch scored as if it had no error handling at all.
 */
const declarationPattern = /^\s*(?:(?:export|public|private|protected|static|async|def|function)\s+)*[\w$.]+\s*\([^)]*\)\s*(?:->[^:]*)?\s*[:{]\s*$/;

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, content, diff) {
    if (diff?.changedLines) return [];
    const lines = contentLines(maskComments(content, path));
    const findings: Finding[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!ioPattern.test(lines[index]) && !(/\.py$/i.test(path) && pythonOpenPattern.test(lines[index]))) continue;
      if (declarationPattern.test(lines[index]) || contextManagerPattern.test(lines[index])) continue;
      const nearby = lines.slice(Math.max(0, index - 12), index + 13).join("\n");
      if (/\b(?:try|catch|except|\.catch\s*\(|on\s*\(\s*['"]error|if\s+[^\n]*(?:error|status|ok))\b/i.test(nearby)) continue;
      const line = index + 1;
      if (isIncluded(line, diff)) findings.push(makeFinding(this, path, line, lineText(content, line)));
    }
    return findings;
  },
};
