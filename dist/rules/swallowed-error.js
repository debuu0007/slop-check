import { contentLines, isIncluded, lineNumberAt, lineText, makeFinding, maskComments } from "./shared.js";
export const id = "swallowed-error";
export const displayName = "The Gulp";
export const weight = 0.18;
export const why = "Failures are caught and discarded without recovery or reporting.";
export const roasts = [
    "The exception has been promoted to a secret.",
    "Failure is now an undocumented success state.",
    "The error went somewhere quiet to think.",
    "Reliable, provided nothing ever goes wrong.",
];
const expression = /\.catch\s*\(\s*(?:\([^)]*\)|[\w$]+)?\s*=>\s*(?:\{\s*\}|(?:undefined|null))\s*\)|except(?:\s+(?:Exception|BaseException)(?:\s+as\s+\w+)?)?\s*:\s*(?:#.*\n\s*)?pass\b/gm;
const indentOf = (line) => /^[ \t]*/.exec(line)[0].length;
/**
 * Swallowing in `__del__` is correct Python, not an oversight. The interpreter
 * discards exceptions raised during finalization anyway, and letting one escape
 * only prints noise to stderr during garbage collection or interpreter shutdown -
 * so the suppression a maintainer wrote there is the fix, and reporting it asks
 * them to make the code worse.
 */
function enclosingDefinition(lines, line) {
    const indent = indentOf(lines[line - 1] ?? "");
    for (let index = line - 2; index >= 0; index -= 1) {
        const text = lines[index];
        if (!text.trim() || indentOf(text) >= indent)
            continue;
        const match = /^\s*(?:async\s+)?def\s+(\w+)/.exec(text);
        if (match)
            return match[1];
        if (/^\s*(?:class|def)\b/.test(text))
            return "";
    }
    return "";
}
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        const lines = contentLines(content);
        const findings = [];
        for (const match of maskComments(content, path).matchAll(expression)) {
            const line = lineNumberAt(content, match.index ?? 0);
            if (enclosingDefinition(lines, line) === "__del__")
                continue;
            if (isIncluded(line, diff))
                findings.push(makeFinding(this, path, line, lineText(content, line)));
        }
        return findings;
    },
};
//# sourceMappingURL=swallowed-error.js.map