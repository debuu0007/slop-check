import { contentLines } from "./rules/shared.js";
/**
 * A static analyser needs a way for the author to say "I meant this". Without one,
 * a maintainer whose deliberate choice is scored as slop has no recourse except to
 * dismiss the entire report, so a single disagreement discards every true finding
 * alongside it.
 *
 * Three scopes, each written as an ordinary comment in any supported language:
 * next-line covers the line below the directive, line covers the line the
 * directive sits on, and file covers the whole file. A directive with no rule
 * names covers every rule in its scope; naming rules, separated by spaces or
 * commas, covers only those. README.md carries worked examples - deliberately not
 * repeated here, because a directive written inside this file would be read as a
 * real one and silence findings in it.
 *
 * Suppression runs before scoring, so a suppressed finding cannot move the grade,
 * and the count is reported so that silencing stays visible in the output rather
 * than becoming a quiet way to improve a score.
 */
const DIRECTIVE = /(?:\/\/|#|\/\*|\*)\s*slop-disable-(next-line|line|file)\b(?<rules>[^*\n]*)/g;
function namedRules(raw) {
    const named = (raw ?? "").replace(/\*\/.*$/, "").trim();
    return new Set(named ? named.split(/[\s,]+/).filter(Boolean) : []);
}
function directivesFor(content) {
    const directives = { file: [], byLine: new Map() };
    const lines = contentLines(content);
    for (const [index, text] of lines.entries()) {
        DIRECTIVE.lastIndex = 0;
        for (const match of text.matchAll(DIRECTIVE)) {
            const scope = match[1];
            const rules = namedRules(match.groups?.rules);
            if (scope === "file") {
                directives.file.push(rules);
                continue;
            }
            const target = scope === "next-line" ? index + 2 : index + 1;
            const existing = directives.byLine.get(target) ?? [];
            existing.push(rules);
            directives.byLine.set(target, existing);
        }
    }
    return directives;
}
function covers(sets, ruleId) {
    return sets?.some((set) => set.size === 0 || set.has(ruleId)) ?? false;
}
/** Drops findings that the file's disable directives cover, and counts them. */
export function applySuppressions(findings, contents) {
    const cache = new Map();
    const kept = [];
    let suppressed = 0;
    for (const finding of findings) {
        const content = contents.get(finding.path);
        if (content === undefined) {
            kept.push(finding);
            continue;
        }
        let directives = cache.get(finding.path);
        if (!directives) {
            directives = directivesFor(content);
            cache.set(finding.path, directives);
        }
        if (covers(directives.file, finding.ruleId) || covers(directives.byLine.get(finding.line), finding.ruleId)) {
            suppressed += 1;
            continue;
        }
        kept.push(finding);
    }
    return { findings: kept, suppressed };
}
//# sourceMappingURL=suppression.js.map