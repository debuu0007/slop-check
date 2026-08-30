import type { Finding, Rule } from "../types.js";
import { contentLines, findingsFromRegex, isIncluded, lineText, makeFinding } from "./shared.js";

export const id = "debug-residue";
export const displayName = "The Breadcrumb";
export const weight = 0.04;
export const why = "Temporary probes and commented code mark unfinished cleanup.";
export const roasts = [
  "The investigation concluded. The evidence remained.",
  "A breadcrumb from somewhere the debugger once visited.",
  "The console has been included in the release team.",
  "Temporary, in the geological sense.",
] as const;

export const rule: Rule = {
  id, displayName, weight, why, roasts,
  check(path, content, diff) {
    const findings = findingsFromRegex(this, path, content, /\b(?:console\.log|print)\s*\(\s*['"](?:here|test|got here|debug|reached|hello|value:?|foo|bar)[^'"]*['"]/gi, diff);
    const lines = contentLines(content);
    let start = -1;
    for (let index = 0; index <= lines.length; index += 1) {
      const isCommentedCode = index < lines.length && /^\s*(?:\/\/|#)\s*(?:const|let|var|if|for|while|return|await|def|class|[\w$.]+\s*[=(])/.test(lines[index]);
      if (isCommentedCode && start < 0) start = index;
      if (!isCommentedCode && start >= 0) {
        if (index - start >= 5 && isIncluded(start + 1, diff)) findings.push(makeFinding(this, path, start + 1, lineText(content, start + 1)));
        start = -1;
      }
    }
    return findings as Finding[];
  },
};
