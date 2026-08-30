import { gradeFor } from "./grades.js";
import { rules } from "./rules/index.js";
import type { AnalysisResult, FindingGroup } from "./types.js";

const ansi = {
  reset: "\u001b[0m",
  green: "\u001b[32m",
  lime: "\u001b[92m",
  yellow: "\u001b[33m",
  orange: "\u001b[38;5;208m",
  red: "\u001b[31m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
};

function meter(score: number, width: number): string {
  const filled = Math.round((score / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function colorFor(score: number): string {
  if (score <= 9) return ansi.green;
  if (score <= 24) return ansi.lime;
  if (score <= 44) return ansi.yellow;
  if (score <= 69) return ansi.orange;
  return ansi.red;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, width - 1)}…`;
}

function visibleLength(value: string): number {
  return value.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/** Instances shown per group before the rest are counted rather than listed. */
const INSTANCES_SHOWN = 3;

function groupText(group: FindingGroup, serious: boolean, color: boolean): string {
  const tally = group.count > 1 ? ` ×${group.count}` : "";
  const heading = color
    ? `${ansi.bold}${group.path}${ansi.reset}  ${group.displayName}${tally}`
    : `${group.path}  ${group.displayName}${tally}`;
  const shown = group.findings.slice(0, INSTANCES_SHOWN);
  const lines = [heading, ...shown.map((finding) => `   │ ${String(finding.line).padStart(5)}  ${finding.snippet}`)];
  const remaining = group.count - shown.length;
  if (remaining) lines.push(`   │ ${color ? ansi.dim : ""}… and ${remaining} more in this file${color ? ansi.reset : ""}`);
  if (!serious) lines.push(`   │ ${color ? ansi.dim : ""}${shown[0]?.roast ?? ""}${color ? ansi.reset : ""}`);
  return lines.join("\n");
}

export interface ReportOptions { serious?: boolean; explain?: boolean; top?: number; color?: boolean }

function explanation(result: AnalysisResult): string {
  const floor = result.smallSampleFloorApplied ? ` (small-sample floor applied: scored as ${result.effectiveKloc.toFixed(3)} KLOC)` : "";
  const damped = result.rawWeightedHits > result.weightedHits
    ? ` (repetition damped from ${result.rawWeightedHits.toFixed(3)} raw)`
    : "";
  return `score = min(100, 100 × ${result.weightedHits.toFixed(3)} weighted hits${damped} / ${result.effectiveKloc.toFixed(3)} KLOC) = ${result.score}${floor}`;
}

export function renderPlain(result: AnalysisResult, options: ReportOptions = {}): string {
  const activeRules = rules.map((rule) => ({ name: rule.displayName, hits: result.ruleHits[rule.id] ?? 0 })).filter((item) => item.hits).sort((a, b) => b.hits - a.hits);
  const worst = result.files.slice().sort((a, b) => b.findings.length - a.findings.length || a.path.localeCompare(b.path))[0];
  const lines = [
    `slop-check v${result.version} — ${result.filesScanned} files, ${result.linesScanned} lines`,
    ...(result.skippedFiles ? [`skipped ${result.skippedFiles} files (minified/oversized)`] : []),
    ...(result.suppressedFindings ? [`suppressed ${result.suppressedFindings} finding${result.suppressedFindings === 1 ? "" : "s"}`] : []),
    ...(result.baselinedFindings ? [`${result.baselinedFindings} pre-existing findings baselined`] : []),
    `SLOP SCORE ${result.score} / 100`,
    `GRADE ${result.grade} — ${result.label}`,
    ...activeRules.map((item) => `${item.name}: ${item.hits}`),
    `worst file: ${worst?.findings.length ? `${worst.path} (${worst.findings.length} hits)` : "none"}`,
  ];
  if (options.explain) lines.push(explanation(result));
  const selected = result.groups.slice(0, options.top ?? result.groups.length);
  if (selected.length) lines.push("", ...selected.map((group) => groupText(group, Boolean(options.serious), false)).flatMap((item, index) => index ? ["", item] : [item]));
  if (result.grade === "A") lines.push("", "Grade A? Prove it: add the badge with `slop-check --badge > slop-check.svg`.");
  return `${lines.join("\n")}\n`;
}

export function renderTty(result: AnalysisResult, options: ReportOptions = {}): string {
  const width = 58;
  const inner = width - 4;
  const color = colorFor(result.score);
  const row = (value = "") => {
    const display = visibleLength(value) <= inner ? value : truncate(value.replace(/\u001b\[[0-9;]*m/g, ""), inner);
    return `  │  ${display}${" ".repeat(Math.max(0, inner - visibleLength(display)))}│`;
  };
  const activeRules = rules.map((rule) => ({ name: rule.displayName, hits: result.ruleHits[rule.id] ?? 0 })).filter((item) => item.hits).sort((a, b) => b.hits - a.hits).slice(0, 5);
  const worst = result.files.slice().sort((a, b) => b.findings.length - a.findings.length || a.path.localeCompare(b.path))[0];
  const report = [
    `  ┌${"─".repeat(width - 2)}┐`,
    row(`slop-check v${result.version}        ${result.filesScanned} files · ${result.linesScanned.toLocaleString()} lines`),
    ...(result.skippedFiles ? [row(`skipped ${result.skippedFiles} files (minified/oversized)`)] : []),
    ...(result.suppressedFindings ? [row(`suppressed ${result.suppressedFindings} finding${result.suppressedFindings === 1 ? "" : "s"}`)] : []),
    ...(result.baselinedFindings ? [row(`${result.baselinedFindings} pre-existing findings baselined`)] : []),
    row(),
    row(`SLOP SCORE   ${color}${meter(result.score, 22)}${ansi.reset}  ${String(result.score).padStart(3)} / 100`),
    row(),
    row(`GRADE   ${color}${ansi.bold}${result.grade}${ansi.reset} — ${result.label}`),
    row(),
    ...activeRules.map((item) => row(`${item.name.padEnd(19)} ×${String(item.hits).padEnd(4)} ${"█".repeat(Math.min(12, item.hits))}`)),
    ...(activeRules.length ? [row()] : []),
    row(`worst file: ${worst?.findings.length ? `${worst.path} (${worst.findings.length} hits)` : "none"}`),
    `  └${"─".repeat(width - 2)}┘`,
  ];
  if (options.explain) report.push("", `  ${explanation(result)}`);
  const selected = result.groups.slice(0, options.top ?? result.groups.length);
  if (selected.length) report.push("", ...selected.map((group) => `  ${groupText(group, Boolean(options.serious), true).replace(/\n/g, "\n  ")}`).flatMap((item, index) => index ? ["", item] : [item]));
  if (result.grade === "A") report.push("", "  Grade A? Prove it: add the badge with `slop-check --badge > slop-check.svg`.");
  return `${report.join("\n")}\n`;
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderBadge(result: AnalysisResult): string {
  const grade = gradeFor(result.score);
  const label = `slop-check | ${grade.grade}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="116" height="20" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient><clipPath id="r"><rect width="116" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="82" height="20" fill="#24292f"/><rect x="82" width="34" height="20" fill="${grade.color}"/><rect width="116" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="41" y="15" fill="#010101" fill-opacity=".3">slop-check</text><text x="41" y="14">slop-check</text><text x="99" y="15" fill="#010101" fill-opacity=".3">${grade.grade}</text><text x="99" y="14">${grade.grade}</text></g></svg>\n`;
}
