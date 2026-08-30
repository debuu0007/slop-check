import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFiles } from "../src/files.js";

describe("file collection", () => {
  it("skips dot directories and reports oversized or minified sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "slop-files-"));
    await mkdir(join(root, ".next"));
    await writeFile(join(root, ".next", "hidden.ts"), "const hidden = true;");
    await writeFile(join(root, "visible.ts"), "const visible = true;");
    await writeFile(join(root, "bundle.min.js"), "const minified=true;");
    await writeFile(join(root, "long.js"), `const value = "${"x".repeat(1001)}";`);
    const result = await collectFiles(root);
    expect(result.files.map((file) => file.path)).toEqual(["visible.ts"]);
    expect(result.skippedFiles).toBe(2);
  });
});
