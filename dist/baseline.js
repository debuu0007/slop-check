import { readFile, writeFile } from "node:fs/promises";
import { gradeFor } from "./grades.js";
function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
}
function key(finding) {
    return `${finding.ruleId}\0${finding.path}\0${hash(finding.snippet.trim().replace(/\s+/g, " "))}`;
}
export function baselineEntries(findings) {
    return findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.path, snippetHash: key(finding).split("\0")[2] })).sort((a, b) => `${a.path}:${a.ruleId}:${a.snippetHash}`.localeCompare(`${b.path}:${b.ruleId}:${b.snippetHash}`));
}
export async function writeBaseline(path, findings) {
    await writeFile(path, `${JSON.stringify({ version: 1, findings: baselineEntries(findings) }, null, 2)}\n`, "utf8");
}
export async function readBaseline(path) {
    try {
        return JSON.parse(await readFile(path, "utf8")).findings;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw new Error(`Invalid baseline: ${error.message}`);
    }
}
export function applyBaseline(result, baseline) {
    const keys = new Set(baseline.map((entry) => `${entry.ruleId}\0${entry.path}\0${entry.snippetHash}`));
    const findings = result.findings.filter((finding) => !keys.has(key(finding)));
    const baselinedFindings = result.findings.length - findings.length;
    const files = result.files.map((file) => {
        const own = file.findings.filter((finding) => findings.includes(finding));
        const weighted = own.reduce((sum, finding) => sum + finding.weight, 0);
        return { ...file, findings: own, score: weighted ? Math.min(100, Math.round((100 * weighted) / (Math.max(file.lines, 420) / 1000))) : 0 };
    });
    const weightedHits = Number(findings.reduce((sum, finding) => sum + finding.weight, 0).toFixed(6));
    const score = weightedHits ? Math.min(100, Math.round((100 * weightedHits) / result.effectiveKloc)) : 0;
    const grade = gradeFor(score);
    const ruleHits = Object.fromEntries(Object.keys(result.ruleHits).map((id) => [id, findings.filter((finding) => finding.ruleId === id).length]));
    return { ...result, score, grade: grade.grade, label: grade.label, weightedHits, findings, files, ruleHits, baselinedFindings };
}
//# sourceMappingURL=baseline.js.map