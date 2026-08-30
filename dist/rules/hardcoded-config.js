import { isIncluded, lineNumberAt, lineText, makeFinding } from "./shared.js";
import { configLiteralPattern as candidate, isReservedLiteral } from "../repo-index.js";
export const id = "hardcoded-config";
export const displayName = "The Squatter";
export const weight = 0.06;
export const why = "Repeated environment-specific literals quietly become configuration.";
export const roasts = [
    "Configuration has settled down and started receiving mail.",
    "Works on the machine encoded directly above.",
    "An environment variable without the variable part.",
    "Deployment flexibility is currently a search-and-replace operation.",
];
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        const counts = diff?.repoIndex?.literalCounts ?? new Map();
        const findings = [];
        for (const match of content.matchAll(new RegExp(candidate.source, "g"))) {
            const value = match[2] ?? match[0];
            if (isReservedLiteral(value))
                continue;
            if ((counts.get(value) ?? 0) < 3)
                continue;
            const line = lineNumberAt(content, match.index ?? 0);
            if (isIncluded(line, diff))
                findings.push(makeFinding(this, path, line, lineText(content, line)));
        }
        return findings;
    },
};
//# sourceMappingURL=hardcoded-config.js.map