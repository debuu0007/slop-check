import { gradeFor } from "./grades.js";
import { rules } from "./rules/index.js";
import { contentLines, isSupported } from "./rules/shared.js";
import { buildRepoIndex } from "./repo-index.js";
import { applySuppressions } from "./suppression.js";
import { VERSION } from "./generated-version.js";
const MINIMUM_EFFECTIVE_LINES = 420;
function lineCount(content) {
    if (!content)
        return 0;
    return contentLines(content).length - (content.endsWith("\n") ? 1 : 0);
}
function score(weightedHits, lines) {
    if (!weightedHits || !lines)
        return 0;
    return Math.min(100, Math.round((100 * weightedHits) / (Math.max(lines, MINIMUM_EFFECTIVE_LINES) / 1000)));
}
/**
 * How many hits of one rule count in full before repetition stops adding evidence.
 */
const FULL_WEIGHT_HITS = 5;
/**
 * A house idiom is one decision, however many times it was typed. A codebase that
 * writes `.catch(() => {})` on forty teardown paths has made a single stylistic
 * choice, and charging it forty times let one idiom carry a repository to an F on
 * its own - the same failure a linter has when no rule is capped. The first few
 * hits are the evidence; past that, each additional one says progressively less,
 * so they accrue logarithmically instead of linearly. Distinct rules still stack
 * in full, because a repository with twelve different problems genuinely has more
 * wrong with it than one with twelve copies of a single problem.
 */
function dampedHits(hits) {
    return hits <= FULL_WEIGHT_HITS ? hits : FULL_WEIGHT_HITS + Math.log2(1 + hits - FULL_WEIGHT_HITS);
}
function groupFindings(findings) {
    const groups = new Map();
    for (const finding of findings) {
        const key = `${finding.ruleId}\u0000${finding.path}`;
        const existing = groups.get(key);
        if (existing) {
            existing.findings.push(finding);
            existing.count += 1;
            continue;
        }
        groups.set(key, { ruleId: finding.ruleId, displayName: finding.displayName, path: finding.path, weight: finding.weight, why: finding.why, count: 1, findings: [finding] });
    }
    return [...groups.values()].sort((left, right) => right.weight * right.count - left.weight * left.count || left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId));
}
function findingOrder(left, right) {
    return right.weight - left.weight || left.path.localeCompare(right.path) || left.line - right.line || left.ruleId.localeCompare(right.ruleId);
}
export function analyzeFiles(input, options = {}) {
    const files = [...input].filter((file) => isSupported(file.path)).sort((a, b) => a.path.localeCompare(b.path));
    const repoIndex = buildRepoIndex(files, options.diffContexts);
    // Scored files are always resolvable; knownPaths adds everything else the project has.
    const knownPaths = new Set([...files.map((file) => file.path), ...(options.knownPaths ?? [])]);
    const findingsByFile = new Map();
    const effectiveLines = new Map();
    const contents = new Map(files.map((file) => [file.path, file.content]));
    let suppressedFindings = 0;
    for (const file of files) {
        const supplied = options.diffContexts?.get(file.path);
        const context = { ...supplied, repository: files, repoIndex, knownPaths, repositoryComplete: options.completeRepository === true };
        const found = rules.flatMap((rule) => rule.check(file.path, file.content, context)).map((finding) => ({
            ...finding,
            weight: options.weights?.[finding.ruleId] ?? finding.weight,
        }));
        // Before scoring: a suppressed finding must not reach the grade either.
        const kept = applySuppressions(found, contents);
        suppressedFindings += kept.suppressed;
        findingsByFile.set(file.path, kept.findings.sort(findingOrder));
        effectiveLines.set(file.path, supplied?.changedLines ? supplied.changedLines.size + (supplied.deletedLines?.length ?? 0) : lineCount(file.content));
    }
    const fileResults = files.map((file) => {
        const findings = findingsByFile.get(file.path) ?? [];
        const lines = effectiveLines.get(file.path) ?? 0;
        const weighted = findings.reduce((sum, finding) => sum + finding.weight, 0);
        return { path: file.path, lines, score: score(weighted, lines), findings };
    });
    const allFindings = fileResults.flatMap((file) => file.findings);
    const hitsPerFile = new Map(fileResults.map((file) => [file.path, file.findings.length]));
    allFindings.sort((left, right) => (hitsPerFile.get(right.path) ?? 0) - (hitsPerFile.get(left.path) ?? 0) || findingOrder(left, right));
    const linesScanned = [...effectiveLines.values()].reduce((sum, lines) => sum + lines, 0);
    const rawWeightedHits = Number(allFindings.reduce((sum, finding) => sum + finding.weight, 0).toFixed(6));
    const hitsByRule = new Map();
    for (const finding of allFindings) {
        const list = hitsByRule.get(finding.ruleId);
        if (list)
            list.push(finding);
        else
            hitsByRule.set(finding.ruleId, [finding]);
    }
    const weightedHits = Number([...hitsByRule.values()].reduce((sum, list) => sum + list[0].weight * dampedHits(list.length), 0).toFixed(6));
    const totalScore = score(weightedHits, linesScanned);
    const grade = gradeFor(totalScore);
    const ruleHits = Object.fromEntries(rules.map((rule) => [rule.id, 0]));
    for (const finding of allFindings)
        ruleHits[finding.ruleId] += 1;
    return {
        version: VERSION,
        score: totalScore,
        grade: grade.grade,
        label: grade.label,
        filesScanned: files.length,
        skippedFiles: options.skippedFiles ?? 0,
        baselinedFindings: 0,
        suppressedFindings,
        linesScanned,
        effectiveKloc: Number((Math.max(linesScanned, MINIMUM_EFFECTIVE_LINES) / 1000).toFixed(3)),
        smallSampleFloorApplied: linesScanned < MINIMUM_EFFECTIVE_LINES,
        weightedHits,
        rawWeightedHits,
        findings: allFindings,
        groups: groupFindings(allFindings),
        files: fileResults,
        ruleHits,
    };
}
//# sourceMappingURL=engine.js.map