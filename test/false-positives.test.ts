import { describe, expect, it } from "vitest";
import { rules } from "../src/rules/index.js";
import { splitTopLevel } from "../src/repo-index.js";
import { maskComments } from "../src/rules/shared.js";
import { buildRepoIndex } from "../src/repo-index.js";
import { analyzeFiles } from "../src/engine.js";
import { isScannable } from "../src/paths.js";
import type { SourceFile } from "../src/types.js";

const rule = (id: string) => rules.find((candidate) => candidate.id === id)!;

function check(id: string, path: string, content: string, extra: SourceFile[] = []) {
  const files = [{ path, content }, ...extra];
  return rule(id).check(path, content, { repository: files, repoIndex: buildRepoIndex(files), knownPaths: new Set(files.map((file) => file.path)), repositoryComplete: true });
}

/**
 * Every case here is a real finding a scan reported against a well-reviewed
 * repository, kept as the thing each fix must not start doing again.
 */
describe("known false positives stay silent", () => {
  it("splits parameter lists across generics and string literals", () => {
    expect(splitTopLevel("project: dict[str, Any], *, protected: bool = False")).toEqual(["project: dict[str, Any]", "*", "protected: bool = False"]);
    expect(splitTopLevel('seq, *, delim: str = ", ", final = "or"')).toEqual(["seq", "*", 'delim: str = ", "', 'final = "or"']);
    expect(splitTopLevel("")).toEqual([]);
  });

  it("dead-defaults ignores public API, whose callers are not in the repository", () => {
    expect(check("dead-defaults", "api.py", 'def model_copy(model, *, deep=False):\n    return model\n\nmodel_copy(1)\n')).toHaveLength(0);
    expect(check("dead-defaults", "api.ts", 'export function spawn(options = {}) {\n  return options;\n}\nspawn();\n')).toHaveLength(0);
  });

  it("dead-defaults counts a keyword argument as an override", () => {
    expect(check("dead-defaults", "u.py", 'def _human_join(seq, *, delim: str = ", ", final="or"):\n    return seq\n\n_human_join(["a"], final="and")\n')).toHaveLength(0);
  });

  it("happy-path-only accepts context-managed I/O and non-builtin open", () => {
    expect(check("happy-path-only", "w.py", 'def save(file, data):\n    with open(file, mode="wb") as f:\n        f.write(data)\n')).toHaveLength(0);
    expect(check("happy-path-only", "w.py", 'def read(sdist):\n    archive = tarfile.open(sdist)\n    return archive\n')).toHaveLength(0);
    // The builtin, called outside a with block, is still the thing the rule is for.
    expect(check("happy-path-only", "w.py", 'def save(file):\n    handle = open(file)\n    return handle.read()\n')).not.toHaveLength(0);
  });

  it("duplicate-helper ignores sync and async twins", () => {
    const body = (name: string) => `def ${name}(func, client, options, retries, timeout):\n    a = build(func, client)\n    b = merge(a, options, retries)\n    c = apply(b, timeout, client)\n    d = wrap(c, func, options)\n    return finalize(d, a, b, c)\n`;
    expect(check("duplicate-helper", "r.py", `${body("to_raw_response_wrapper")}\n${body("async_to_raw_response_wrapper")}`)).toHaveLength(0);
    // The pair may also be spelled sync/async rather than bare/async.
    expect(check("duplicate-helper", "x.py", `${body("_scoped_sync_client")}\n${body("_scoped_async_client")}`)).toHaveLength(0);
    // Two helpers that genuinely rediscovered each other are still reported.
    expect(check("duplicate-helper", "v.py", `${body("common_prompt_suffix_validator")}\n${body("common_prompt_prefix_validator")}`)).not.toHaveLength(0);
  });

  it("swallowed-error allows suppression inside __del__", () => {
    expect(check("swallowed-error", "m.py", 'class C:\n    def __del__(self):\n        try:\n            self.close()\n        except Exception:\n            pass\n')).toHaveLength(0);
    expect(check("swallowed-error", "m.py", 'class C:\n    def run(self):\n        try:\n            self.go()\n        except Exception:\n            pass\n')).not.toHaveLength(0);
  });

  it("does not read prose as code", () => {
    // Both of these are sentences from this repository's own source comments.
    expect(check("swallowed-error", "e.ts", "// writes `.catch(() => {})` on forty teardown paths\nexport const x = 1;\n")).toHaveLength(0);
    expect(check("happy-path-only", "c.js", "/* ----- page metadata fetch (title + og:image) ----- */\nexport const y = 2;\n")).toHaveLength(0);
    // The same text as real code is still reported.
    expect(check("swallowed-error", "e.ts", "export const x = run().catch(() => {});\n")).not.toHaveLength(0);
  });

  it("masks comments without disturbing offsets or string contents", () => {
    const source = 'const url = "https://a.test/x"; // trailing note\nconst next = 1;\n';
    const masked = maskComments(source, "a.ts");
    expect(masked).toHaveLength(source.length);
    expect(masked.split("\n")).toHaveLength(source.split("\n").length);
    // A `//` inside a string must not start a comment and blank the rest of the line.
    expect(masked).toContain('"https://a.test/x"');
    expect(masked).not.toContain("trailing note");
    expect(maskComments('x = 1  # note\ny = """\nnot a # comment\n"""\n', "a.py")).toContain("not a # comment");
  });

  it("excludes examples and docs, where the literal is the point", () => {
    expect(isScannable("examples/mtls_httpx.py")).toBe(false);
    expect(isScannable("docs/quickstart.py")).toBe(false);
    expect(isScannable("src/openai/_client.py")).toBe(true);
  });
});

describe("repetition damping", () => {
  const gulp = (count: number) => Array.from({ length: count }, (_, index) => `export const t${index} = () => run(${index}).catch(() => {});`).join("\n");

  it("charges a repeated idiom sublinearly but never discounts the first hits", () => {
    const few = analyzeFiles([{ path: "a.ts", content: gulp(4) }]);
    expect(few.weightedHits).toBeCloseTo(few.rawWeightedHits, 6);

    const many = analyzeFiles([{ path: "a.ts", content: gulp(40) }]);
    expect(many.rawWeightedHits).toBeCloseTo(40 * 0.18, 6);
    expect(many.weightedHits).toBeLessThan(many.rawWeightedHits / 3);
    expect(many.weightedHits).toBeGreaterThan(few.weightedHits);
  });

  it("still stacks distinct rules in full", () => {
    const mixed = analyzeFiles([{ path: "a.ts", content: 'export const a = () => run().catch(() => {});\n// TODO: implement this properly\nconsole.log("here");\nexport function b(x: any) { return x; }\n' }]);
    expect(mixed.weightedHits).toBeCloseTo(mixed.rawWeightedHits, 6);
  });

  it("groups a rule's hits per file instead of listing them flat", () => {
    const result = analyzeFiles([{ path: "a.ts", content: gulp(12) }]);
    const group = result.groups.find((item) => item.ruleId === "swallowed-error" && item.path === "a.ts");
    expect(group?.count).toBe(12);
    expect(result.groups.filter((item) => item.path === "a.ts" && item.ruleId === "swallowed-error")).toHaveLength(1);
  });
});
