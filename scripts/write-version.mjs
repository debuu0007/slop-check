import { readFile, writeFile } from "node:fs/promises";

async function main() {
  try {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    await writeFile(new URL("../src/generated-version.ts", import.meta.url), `// Generated from package.json by scripts/write-version.mjs.\nexport const VERSION = ${JSON.stringify(packageJson.version)};\n`, "utf8");
  } catch (error) {
    throw new Error("Could not generate the package version module", { cause: error });
  }
}

await main();
