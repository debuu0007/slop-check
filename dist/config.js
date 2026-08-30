import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const allowed = new Set(["ignore", "fail-over", "serious", "weights", "top"]);
export async function loadConfig(directory) {
    try {
        const raw = JSON.parse(await readFile(resolve(directory, ".slopcheckrc"), "utf8"));
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new Error("must contain a JSON object");
        const keys = Object.keys(raw);
        if (keys.length > 5 || keys.some((key) => !allowed.has(key)))
            throw new Error(`only these keys are supported: ${[...allowed].join(", ")}`);
        return raw;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return {};
        throw new Error(`Invalid .slopcheckrc: ${error.message}`);
    }
}
//# sourceMappingURL=config.js.map