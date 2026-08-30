import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { isGeneratedFile, isIllustrativePath, isSupported, isTestPath } from "./paths.js";
const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", "out", "vendor", "vendored", "coverage", "web-dist"]);
function globRegex(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^(?:${escaped}|.*/${escaped})(?:/.*)?$`);
}
export async function collectFiles(target, ignorePatterns = []) {
    const absolute = resolve(target);
    const rootStat = await stat(absolute);
    const root = rootStat.isDirectory() ? absolute : resolve(absolute, "..");
    const ignores = ignorePatterns.map(globRegex);
    const results = [];
    // Every source path on disk, including ones this scan will not score. Import
    // resolution needs the real file listing, not the filtered one.
    const knownPaths = [];
    let skippedFiles = 0;
    async function visit(path) {
        const info = await stat(path);
        const displayPath = relative(root, path).split(sep).join("/") || basename(path);
        if (!info.isDirectory() && isSupported(displayPath))
            knownPaths.push(displayPath);
        if (ignores.some((pattern) => pattern.test(displayPath)))
            return;
        if (info.isDirectory()) {
            if (path !== absolute && (ignoredDirectories.has(basename(path)) || basename(path).startsWith(".")))
                return;
            const entries = await readdir(path);
            await Promise.all(entries.sort().map((entry) => visit(resolve(path, entry))));
            return;
        }
        if (!isSupported(displayPath))
            return;
        if (/\.min\.[^.]+$/i.test(displayPath)) {
            skippedFiles += 1;
            return;
        }
        if (isGeneratedFile(displayPath))
            return;
        if (isTestPath(displayPath))
            return;
        if (isIllustrativePath(displayPath))
            return;
        if (info.size > 1024 * 1024) {
            skippedFiles += 1;
            return;
        }
        let content;
        try {
            content = await readFile(path, "utf8");
        }
        catch (error) {
            throw new Error(`Could not read ${displayPath}`, { cause: error });
        }
        const lines = content.split(/\r?\n/);
        if (lines.some((line) => line.length > 1000)) {
            skippedFiles += 1;
            return;
        }
        results.push({ path: displayPath, content });
    }
    await visit(absolute);
    return { files: results.sort((a, b) => a.path.localeCompare(b.path)), skippedFiles, knownPaths };
}
//# sourceMappingURL=files.js.map