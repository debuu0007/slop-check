#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeFiles } from "./engine.js";
import { parseUnifiedDiff } from "./diff.js";
import { collectFiles } from "./files.js";
import { loadConfig } from "./config.js";
import { renderBadge, renderPlain, renderTty } from "./report.js";
import { applyBaseline, readBaseline, writeBaseline } from "./baseline.js";
import { VERSION } from "./generated-version.js";

interface CliOptions {
  target: string;
  diff: boolean;
  json: boolean;
  badge: boolean;
  serious?: boolean;
  explain: boolean;
  failOver?: number;
  top?: number;
  baseline: boolean;
}

const help = `slop-check [path] [options]

Scan JavaScript, TypeScript, and Python for code that performs doneness.

Options:
  --diff             read a unified diff from stdin; inspect changed lines only
  --json             emit stable machine-readable JSON
  --fail-over <n>    exit 1 when the score is greater than or equal to n
  --badge            emit a self-contained SVG badge
  --baseline         write current findings to .slop-baseline.json
  --serious          omit roast lines
  --explain          print the score arithmetic
  --top <n>          show at most n findings
  --help             show this help
  --version          show the version
`;

function numeric(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} requires a non-negative number`);
  return parsed;
}

function argumentsFrom(values: string[]): CliOptions {
  const options: CliOptions = { target: ".", diff: false, json: false, badge: false, explain: false, baseline: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--diff") options.diff = true;
    else if (value === "--json") options.json = true;
    else if (value === "--badge") options.badge = true;
    else if (value === "--baseline") options.baseline = true;
    else if (value === "--serious") options.serious = true;
    else if (value === "--explain") options.explain = true;
    else if (value === "--fail-over") options.failOver = numeric(values[++index], value);
    else if (value === "--top") options.top = numeric(values[++index], value);
    else if (value === "--help" || value === "-h") { process.stdout.write(help); process.exit(0); }
    else if (value === "--version" || value === "-v") { process.stdout.write(`${VERSION}\n`); process.exit(0); }
    else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else options.target = value;
  }
  return options;
}

async function stdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const options = argumentsFrom(process.argv.slice(2));
  let configDirectory = process.cwd();
  if (!options.diff) {
    const absolute = resolve(options.target);
    configDirectory = (await stat(absolute)).isDirectory() ? absolute : dirname(absolute);
  }
  const config = await loadConfig(configDirectory);
  const source = options.diff
    ? { ...parseUnifiedDiff(await stdin()), skippedFiles: 0, knownPaths: undefined }
    : { ...(await collectFiles(options.target, config.ignore)), contexts: undefined };
  // A directory walk enumerates the whole project; a diff on stdin sees only what changed.
  const completeRepository = !options.diff;
  let result = analyzeFiles(source.files, { diffContexts: source.contexts, weights: config.weights, skippedFiles: source.skippedFiles, completeRepository, knownPaths: source.knownPaths });
  const baselinePath = resolve(configDirectory, ".slop-baseline.json");
  if (options.baseline) {
    await writeBaseline(baselinePath, result.findings);
    process.stdout.write(`Wrote ${result.findings.length} findings to ${baselinePath}\n`);
    return;
  }
  const baseline = await readBaseline(baselinePath);
  if (baseline) result = applyBaseline(result, baseline);
  const serious = options.serious ?? config.serious ?? false;
  const top = options.top ?? config.top;

  if (options.badge) process.stdout.write(renderBadge(result));
  else if (options.json) {
    const output = serious ? { ...result, findings: result.findings.map((finding) => ({ ...finding, roast: "" })), files: result.files.map((file) => ({ ...file, findings: file.findings.map((finding) => ({ ...finding, roast: "" })) })) } : result;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else if (process.stdout.isTTY) process.stdout.write(renderTty(result, { serious, explain: options.explain, top }));
  else process.stdout.write(renderPlain(result, { serious, explain: options.explain, top }));

  const threshold = options.failOver ?? config["fail-over"];
  if (threshold !== undefined && result.score >= threshold) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`slop-check: ${(error as Error).message}\n`);
  process.exitCode = 2;
});
