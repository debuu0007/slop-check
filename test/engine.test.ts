import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFiles } from "../src/engine.js";
import { parseUnifiedDiff } from "../src/diff.js";
import { applyBaseline, baselineEntries } from "../src/baseline.js";

describe("engine", () => {
  it("uses the documented exact score arithmetic", () => {
    const content = ["// In a real implementation, validate this", ...Array.from({ length: 999 }, (_, index) => `const clean${index}: string = \"ok\";`)].join("\n");
    const result = analyzeFiles([{ path: "fixture.ts", content }]);
    expect(result.linesScanned).toBe(1000);
    expect(result.weightedHits).toBe(0.1);
    expect(result.score).toBe(10);
    expect(result.grade).toBe("B");
  });

  it("scores only added lines in diff mode", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -20,2 +20,3 @@
 const existing: any = value;
+// For demo purposes, skip validation
 return value;
`);
    const result = analyzeFiles(parsed.files, { diffContexts: parsed.contexts });
    expect(result.linesScanned).toBe(1);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(["apology-comments"]);
  });

  it("counts deleted safety lines as touched diff lines", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,2 +1,1 @@
-validateInput(value);
 return value;
`);
    const result = analyzeFiles(parsed.files, { diffContexts: parsed.contexts });
    expect(result.linesScanned).toBe(1);
    expect(result.findings[0].ruleId).toBe("deletion-flag");
    expect(result.score).toBe(48);
  });

  it("floors a one-line TODO diff at grade B", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -0,0 +1 @@
+// TODO: proper validation
`);
    const result = analyzeFiles(parsed.files, { diffContexts: parsed.contexts });
    expect(result.score).toBeLessThanOrEqual(24);
    expect(result.grade).toBe("B");
    expect(result.effectiveKloc).toBe(0.42);
    expect(result.smallSampleFloorApplied).toBe(true);
  });

  it("does not flag a test line moved within a diff", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.test.ts b/src/example.test.ts
--- a/src/example.test.ts
+++ b/src/example.test.ts
@@ -1,3 +1,3 @@
-test("works", runCase);
 const marker = true;
+  test("works", runCase);
 return marker;
`);
    expect(analyzeFiles(parsed.files, { diffContexts: parsed.contexts }).findings.filter((finding) => finding.ruleId === "deletion-flag")).toHaveLength(0);
  });

  it("skips context-dependent Sunshine Code findings in diff mode", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -20,1 +20,2 @@
+const response = await fetch(url);
 return response;
`);
    expect(analyzeFiles(parsed.files, { diffContexts: parsed.contexts }).findings.filter((finding) => finding.ruleId === "happy-path-only")).toHaveLength(0);
  });

  it("uses touched lines for Type Amnesia density in a sparse diff", () => {
    const parsed = parseUnifiedDiff(`diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -999,0 +1000 @@
+const payload: any = value;
`);
    expect(analyzeFiles(parsed.files, { diffContexts: parsed.contexts }).findings.some((finding) => finding.ruleId === "any-flood")).toBe(true);
  });

  it("produces stable JSON", () => {
    const files = [{ path: "src/demo.ts", content: "// placeholder implementation\nexport const value = true;" }];
    const first = JSON.stringify(analyzeFiles(files), null, 2);
    const second = JSON.stringify(analyzeFiles(files), null, 2);
    expect(second).toBe(first);
    expect(first).toMatchSnapshot();
  });

  it("keeps reduced fixtures from Lodash and Flask out of D/F territory", async () => {
    const paths = ["test/fixtures/oss/lodash/chunk.js", "test/fixtures/oss/flask/helpers.py"];
    const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(resolve(path), "utf8") })));
    for (const file of files) expect(analyzeFiles([file]).score).toBeLessThan(45);
  });

  it("analyzes 200 generated files within the coarse CI performance budget", () => {
    const files = Array.from({ length: 200 }, (_, file) => ({
      path: `generated/file-${file}.ts`,
      content: Array.from({ length: 20 }, (_, fn) => `function handler${file}_${fn}(value: number) {\n  const first = value + ${fn};\n  const second = first * 2;\n  const third = second - 1;\n  const fourth = third / 2;\n  return fourth;\n}`).join("\n"),
    }));
    const started = performance.now();
    analyzeFiles(files);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("baselines findings by normalized snippet hash rather than line", () => {
    const original = analyzeFiles([{ path: "legacy.ts", content: "// TODO: proper validation\nconst value = true;" }]);
    const moved = analyzeFiles([{ path: "legacy.ts", content: "const heading = true;\n\n// TODO:   proper validation\nconst value = true;" }]);
    const filtered = applyBaseline(moved, baselineEntries(original.findings));
    expect(filtered.findings).toHaveLength(0);
    expect(filtered.baselinedFindings).toBe(1);
    expect(filtered.score).toBe(0);
  });
});

describe("inline suppression", () => {
  const dirty = [
    "export function load() {",
    "  try { risky(); } catch {}",
    "}",
  ].join("\n");

  it("reports the finding without a directive", () => {
    const result = analyzeFiles([{ path: "a.ts", content: dirty }]);
    expect(result.findings).toHaveLength(1);
    expect(result.suppressedFindings).toBe(0);
  });

  it("a bare directive suppresses the finding and is counted", () => {
    const content = dirty.replace("  try", "  // slop-disable-next-line\n  try");
    const result = analyzeFiles([{ path: "a.ts", content }]);
    expect(result.findings).toHaveLength(0);
    expect(result.suppressedFindings).toBe(1);
    expect(result.score).toBe(0);
  });

  it("a named directive suppresses only that rule", () => {
    const content = dirty.replace("  try", "  // slop-disable-next-line empty-catch\n  try");
    expect(analyzeFiles([{ path: "a.ts", content }]).findings).toHaveLength(0);
    const other = dirty.replace("  try", "  // slop-disable-next-line any-flood\n  try");
    expect(analyzeFiles([{ path: "a.ts", content: other }]).findings).toHaveLength(1);
  });

  it("accepts a python directive on the line above the finding", () => {
    const python = ["def load():", "    try:", "        risky()", "    # slop-disable-next-line swallowed-error", "    except Exception:", "        pass"].join("\n");
    const result = analyzeFiles([{ path: "a.py", content: python }]);
    expect(result.suppressedFindings).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it("does not suppress from a directive that is not on the preceding line", () => {
    const python = ["def load():", "    # slop-disable-next-line swallowed-error", "    try:", "        risky()", "    except Exception:", "        pass"].join("\n");
    expect(analyzeFiles([{ path: "a.py", content: python }]).findings).toHaveLength(1);
  });
});

describe("phantom-import", () => {
  const importer = { path: "src/app.ts", content: 'import { parse } from "./parser.js";\nexport const run = () => parse("x");\n' };

  it("flags a relative import the repository does not contain", () => {
    const result = analyzeFiles([importer], { completeRepository: true });
    expect(result.findings.filter((finding) => finding.ruleId === "phantom-import")).toHaveLength(1);
  });

  it("stays silent once the module exists", () => {
    const result = analyzeFiles([importer, { path: "src/parser.ts", content: "export const parse = (v: string) => v;\n" }], { completeRepository: true });
    expect(result.findings.filter((finding) => finding.ruleId === "phantom-import")).toHaveLength(0);
  });

  it("resolves a directory index", () => {
    const viaIndex = { path: "src/app.ts", content: 'import { parse } from "./parser";\nexport const run = () => parse("x");\n' };
    const result = analyzeFiles([viaIndex, { path: "src/parser/index.ts", content: "export const parse = (v: string) => v;\n" }], { completeRepository: true });
    expect(result.findings.filter((finding) => finding.ruleId === "phantom-import")).toHaveLength(0);
  });

  it("resolves python packages and flags missing ones", () => {
    const app = { path: "pkg/app.py", content: "from .helpers import parse\nfrom .ghost import missing\n" };
    const helpers = { path: "pkg/helpers.py", content: "def parse(value):\n    return value\n" };
    const hits = analyzeFiles([app, helpers], { completeRepository: true }).findings.filter((finding) => finding.ruleId === "phantom-import");
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toContain("ghost");
  });

  it("ignores bare package imports, which cannot be verified offline", () => {
    const bare = { path: "src/app.ts", content: 'import React from "react";\nimport os from "node:os";\n' };
    expect(analyzeFiles([bare], { completeRepository: true }).findings.filter((finding) => finding.ruleId === "phantom-import")).toHaveLength(0);
  });
});

describe("phantom-import assets", () => {
  it("ignores non-source imports it has no way to verify", () => {
    const withAssets = {
      path: "web/main.ts",
      content: 'import "./style.css";\nimport data from "./data.json";\nimport logo from "./logo.svg";\nexport const x = 1;\n',
    };
    expect(analyzeFiles([withAssets], { completeRepository: true }).findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(0);
  });
});

describe("phantom-import completeness gate", () => {
  const importer = { path: "src/app.ts", content: 'import { parse } from "./parser.js";\nexport const run = () => parse("x");\n' };

  it("stays silent on a partial file set, where absence proves nothing", () => {
    expect(analyzeFiles([importer]).findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(0);
    expect(analyzeFiles([importer], { completeRepository: false }).findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(0);
  });

  it("speaks up once the caller confirms the whole repository is present", () => {
    expect(analyzeFiles([importer], { completeRepository: true }).findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(1);
  });
});

describe("suppression scopes", () => {
  const dirty = ["export function load() {", "  try { risky(); } catch {}", "}"].join("\n");

  it("suppresses on the same line", () => {
    const content = dirty.replace("catch {}", "catch {} // slop-disable-line empty-catch");
    const result = analyzeFiles([{ path: "a.ts", content }]);
    expect(result.findings).toHaveLength(0);
    expect(result.suppressedFindings).toBe(1);
  });

  it("suppresses the whole file from a single directive", () => {
    const content = `// slop-disable-file\n${dirty}\n${dirty.replace("load", "loadTwo")}`;
    const result = analyzeFiles([{ path: "a.ts", content }]);
    expect(result.findings).toHaveLength(0);
    expect(result.suppressedFindings).toBe(2);
  });

  it("a named file directive leaves other rules reporting", () => {
    const content = `// slop-disable-file any-flood\n${dirty}`;
    expect(analyzeFiles([{ path: "a.ts", content }]).findings).toHaveLength(1);
  });

  it("accepts comma-separated rule names", () => {
    const content = dirty.replace("  try", "  // slop-disable-next-line any-flood, empty-catch\n  try");
    expect(analyzeFiles([{ path: "a.ts", content }]).findings).toHaveLength(0);
  });

  it("works inside a block comment", () => {
    const content = dirty.replace("  try", "  /* slop-disable-next-line empty-catch */\n  try");
    expect(analyzeFiles([{ path: "a.ts", content }]).findings).toHaveLength(0);
  });

  it("suppressed findings cannot change the grade", () => {
    const plain = analyzeFiles([{ path: "a.ts", content: dirty }]);
    const silenced = analyzeFiles([{ path: "a.ts", content: `// slop-disable-file\n${dirty}` }]);
    expect(plain.score).toBeGreaterThan(0);
    expect(silenced.score).toBe(0);
    expect(silenced.weightedHits).toBe(0);
  });
});

describe("phantom-import path listing", () => {
  const app = { path: "src/app.ts", content: 'import { parse } from "./generated/api.js";\nexport const run = () => parse("x");\n' };

  it("resolves against files the scan knows about but does not score", () => {
    // "src/generated" is the shape of an ignored or capped directory: real on disk,
    // absent from the scored set.
    const result = analyzeFiles([app], { completeRepository: true, knownPaths: ["src/generated/api.ts"] });
    expect(result.findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(0);
  });

  it("still reports an import that is in neither list", () => {
    const result = analyzeFiles([app], { completeRepository: true, knownPaths: ["src/elsewhere/other.ts"] });
    expect(result.findings.filter((f) => f.ruleId === "phantom-import")).toHaveLength(1);
  });
});
