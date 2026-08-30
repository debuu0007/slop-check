import { readFile } from "node:fs/promises";

const escapeMessage = (value) => String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (value) => escapeMessage(value).replace(/:/g, "%3A").replace(/,/g, "%2C");

try {
  const result = JSON.parse(await readFile(process.argv[2], "utf8"));
  const serious = process.argv[3] === "true";
  for (const finding of result.findings) {
    const message = `${finding.displayName} — ${serious ? finding.why : finding.roast}`;
    process.stdout.write(`::warning file=${escapeProperty(finding.path)},line=${finding.line}::${escapeMessage(message)}\n`);
  }
} catch (error) {
  throw new Error("Could not emit slop-check annotations", { cause: error });
}
