import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface SlopConfig {
  ignore?: string[];
  "fail-over"?: number;
  serious?: boolean;
  weights?: Record<string, number>;
  top?: number;
}

const allowed = new Set(["ignore", "fail-over", "serious", "weights", "top"]);

export async function loadConfig(directory: string): Promise<SlopConfig> {
  try {
    const raw: unknown = JSON.parse(await readFile(resolve(directory, ".slopcheckrc"), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("must contain a JSON object");
    const keys = Object.keys(raw);
    if (keys.length > 5 || keys.some((key) => !allowed.has(key))) throw new Error(`only these keys are supported: ${[...allowed].join(", ")}`);
    return raw as SlopConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Invalid .slopcheckrc: ${(error as Error).message}`);
  }
}
