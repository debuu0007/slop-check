import { contentLines, isIncluded, isTypeScript, lineNumberAt, lineText, makeFinding } from "./shared.js";
export const id = "any-flood";
export const displayName = "Type Amnesia";
export const weight = 0.08;
export const why = "Repeated escape hatches erase the guarantees TypeScript was added to provide.";
export const roasts = [
    "The type system has been asked to wait outside.",
    "Everything is possible. Nothing is checked.",
    "Type safety is present in an advisory capacity.",
    "The compiler has agreed not to ask questions.",
];
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        if (!isTypeScript(path))
            return [];
        const matches = [...content.matchAll(/:\s*any\b|\bas\s+any\b|\bany\s*\[|<\s*any\s*>|\bunknown\s+as\b/g)];
        const densityMatches = diff?.changedLines ? matches.filter((match) => isIncluded(lineNumberAt(content, match.index ?? 0), diff)) : matches;
        const lines = Math.max(1, diff?.changedLines?.size ?? contentLines(content).length);
        if ((densityMatches.length * 100) / lines < 3)
            return [];
        const findings = [];
        for (const match of matches) {
            const line = lineNumberAt(content, match.index ?? 0);
            if (isIncluded(line, diff))
                findings.push(makeFinding(this, path, line, lineText(content, line)));
        }
        return findings;
    },
};
//# sourceMappingURL=any-flood.js.map