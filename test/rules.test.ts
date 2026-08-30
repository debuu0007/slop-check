import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { happyPathOnly, rules } from "../src/rules/index.js";
import { parseUnifiedDiff } from "../src/diff.js";
import type { SourceFile } from "../src/types.js";
import { buildRepoIndex } from "../src/repo-index.js";

const fixtureRoot = resolve("test/fixtures");
const rule = (id: string) => rules.find((candidate) => candidate.id === id)!;
async function fixture(id: string, name: string): Promise<SourceFile> {
  return { path: name, content: await readFile(resolve(fixtureRoot, id, name), "utf8") };
}

describe("rule fixtures", () => {
  const simpleCases = [
    ["apology-comments", "positive.ts", "negative.ts"],
    ["empty-catch", "positive.ts", "negative.ts"],
    ["swallowed-error", "positive.py", "negative.py"],
    ["any-flood", "positive.ts", "negative.ts"],
    ["hardcoded-config", "positive.ts", "negative.ts"],
    ["happy-path-only", "positive.ts", "negative.ts"],
    ["dead-defaults", "positive.py", "negative.py"],
    ["debug-residue", "positive.ts", "negative.ts"],
    ["enhancement-theater", "positive.ts", "negative.ts"],
    ["phantom-import", "positive.ts", "negative.ts"],
  ] as const;

  it.each(simpleCases)("%s separates positive and negative fixtures", async (id, positiveName, negativeName) => {
    const positive = await fixture(id, positiveName);
    const negative = await fixture(id, negativeName);
    expect(rule(id).check(positive.path, positive.content, { repository: [positive], repoIndex: buildRepoIndex([positive]), knownPaths: new Set([positive.path]), repositoryComplete: true })).not.toHaveLength(0);
    expect(rule(id).check(negative.path, negative.content, { repository: [negative], repoIndex: buildRepoIndex([negative]), knownPaths: new Set([negative.path]), repositoryComplete: true })).toHaveLength(0);
  });

  it.each([
    ["apology-comments", "positive.py"],
    ["swallowed-error", "positive.ts"],
    ["happy-path-only", "positive.py"],
    ["debug-residue", "positive.py"],
    ["enhancement-theater", "positive.py"],
    ["phantom-import", "positive.py"],
  ] as const)("%s supports the second language fixture", async (id, name) => {
    const positive = await fixture(id, name);
    expect(rule(id).check(positive.path, positive.content, { repository: [positive], repoIndex: buildRepoIndex([positive]), knownPaths: new Set([positive.path]), repositoryComplete: true })).not.toHaveLength(0);
  });

  it("finds a fuzzy duplicate helper across files", async () => {
    const files = await Promise.all([fixture("duplicate-helper", "positive-a.ts"), fixture("duplicate-helper", "positive-b.ts"), fixture("duplicate-helper", "negative.ts")]);
    const repoIndex = buildRepoIndex(files);
    const findings = files.flatMap((file) => rule("duplicate-helper").check(file.path, file.content, { repository: files, repoIndex }));
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe("positive-b.ts");
  });

  it("does not confuse same-shaped functions with different constants", () => {
    const content = Array.from({ length: 20 }, (_, index) => `function handler${index}(value: number) {\n  const route = "route-${index}";\n  const offset = value + ${index};\n  const scaled = offset * ${index + 2};\n  const result = route + scaled;\n  return result;\n}`).join("\n");
    const files = [{ path: "shapes.ts", content }];
    const repoIndex = buildRepoIndex(files);
    expect(rule("duplicate-helper").check("shapes.ts", content, { repository: files, repoIndex })).toHaveLength(0);
  });

  it("only runs deletion-flag on meaningful deleted lines", async () => {
    const positive = parseUnifiedDiff(await readFile(resolve(fixtureRoot, "deletion-flag/positive.diff"), "utf8"));
    const negative = parseUnifiedDiff(await readFile(resolve(fixtureRoot, "deletion-flag/negative.diff"), "utf8"));
    expect(rule("deletion-flag").check(positive.files[0].path, positive.files[0].content, positive.contexts.get(positive.files[0].path))).toHaveLength(1);
    expect(rule("deletion-flag").check(negative.files[0].path, negative.files[0].content, negative.contexts.get(negative.files[0].path))).toHaveLength(0);
  });

  it("parses nested braces in catch handlers", () => {
    const detector = rule("empty-catch");
    expect(detector.check("nested.ts", "try { run(); } catch (e) { if (retry) { } schedule(); }")).toHaveLength(0);
    expect(detector.check("empty.ts", "try { run(); } catch (e) { }")).toHaveLength(1);
    expect(detector.check("noop.ts", "try { run(); } catch { /* noop */ }")).toHaveLength(1);
  });
});

describe("happy-path-only declarations", () => {
  it("does not flag methods that are merely named after I/O functions", () => {
    const source = [
      "class Client {",
      "  async fetch(request) {",
      "    return this.inner(request);",
      "  }",
      "}",
    ].join("\n");
    expect(happyPathOnly.check("client.ts", source, {})).toEqual([]);
  });

  it("still flags a real unguarded call", () => {
    const source = ["async function load(url) {", "  const response = await fetch(url);", "  return response.json();", "}"].join("\n");
    expect(happyPathOnly.check("load.ts", source, {}).length).toBe(1);
  });

  it("does not flag a python def named open", () => {
    expect(happyPathOnly.check("store.py", "def open(self, path):\n    return self._handle\n", {})).toEqual([]);
  });
});
