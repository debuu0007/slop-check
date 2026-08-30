import { isIncluded, lineNumberAt, lineText, makeFinding } from "./shared.js";
export const id = "phantom-import";
export const displayName = "The Mirage";
export const weight = 0.22;
export const why = "A relative import points at a module the repository does not contain.";
export const roasts = [
    "The module was imagined with great confidence.",
    "Imported from a repository that exists in another timeline.",
    "The dependency is load-bearing and also fictional.",
    "Somewhere, this file almost certainly exists.",
];
/**
 * Generated code invents neighbours: it imports `./utils/formatDate` or
 * `from .helpers import parse` because such a module is what the surrounding code
 * implies should exist, and no compiler ran to say otherwise. This is the one
 * AI-specific failure that can be checked with certainty and no network - the
 * repository either contains the target or it does not.
 *
 * Only relative specifiers are checked. A bare `import requests` would need a
 * package registry to verify, which is neither offline nor deterministic, so it is
 * deliberately out of scope.
 */
const jsImport = /(?:^|\n)\s*(?:import\b[^'"\n]*from\s*|import\s*|(?:const|let|var)[^=\n]*=\s*require\s*\(\s*|export\b[^'"\n]*from\s*)['"](\.[^'"\n]*)['"]/g;
const pythonImport = /(?:^|\n)\s*from\s+(\.[\w.]*)\s+import\b/g;
const JS_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".d.ts"];
/**
 * Only source modules can be checked. The index holds nothing but scannable source,
 * so a stylesheet, image, or JSON asset is unverifiable rather than missing -
 * `import "./style.css"` is not a mirage.
 */
const NON_SOURCE_ASSET = /\.[a-z0-9]+$/i;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|py)$/i;
const JS_INDEXES = JS_EXTENSIONS.filter(Boolean).map((extension) => `/index${extension}`);
function directoryOf(path) {
    const cut = path.lastIndexOf("/");
    return cut < 0 ? "" : path.slice(0, cut);
}
/** Resolves "a/b/../c" without touching the filesystem. */
function normalize(path) {
    const parts = [];
    for (const segment of path.split("/")) {
        if (!segment || segment === ".")
            continue;
        if (segment === "..") {
            parts.pop();
            continue;
        }
        parts.push(segment);
    }
    return parts.join("/");
}
function pythonTarget(specifier, fromPath) {
    // ".a.b" climbs one package per leading dot beyond the first.
    const dots = specifier.match(/^\.+/)?.[0].length ?? 1;
    const rest = specifier.slice(dots).replace(/\./g, "/");
    const base = directoryOf(fromPath).split("/").slice(0, Math.max(0, directoryOf(fromPath).split("/").length - (dots - 1)));
    return normalize(`${base.join("/")}/${rest}`);
}
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        const present = diff?.knownPaths;
        /**
         * Absence only means anything when nothing is missing. Run against a partial
         * file set - a diff, a dropped folder, or the browser's 100-file sample of a
         * large repository - every import into the unlisted remainder looks invented.
         * Measured on a large sampled project this produced almost two hundred phantom
         * findings, every one of them pointing at a file that genuinely exists.
         *
         * Note that this is about the path *listing*, not the scanned set: a project
         * whose full file list is known can still be graded on a subset of it.
         */
        if (!present?.size || diff?.repositoryComplete !== true)
            return [];
        const findings = [];
        const python = /\.py$/i.test(path);
        const resolves = (target) => {
            if (!target)
                return true;
            if (python)
                return present.has(`${target}.py`) || present.has(`${target}/__init__.py`);
            // Under NodeNext, TypeScript source is imported by its compiled ".js" name,
            // so "./parser.js" legitimately resolves to "parser.ts". This project's own
            // imports are written that way.
            const stem = target.replace(/\.(?:js|jsx|mjs|cjs)$/i, "");
            return present.has(target)
                || JS_EXTENSIONS.some((extension) => present.has(`${stem}${extension}`))
                || JS_INDEXES.some((index) => present.has(`${stem}${index}`) || present.has(`${target}${index}`));
        };
        for (const match of content.matchAll(python ? pythonImport : jsImport)) {
            const specifier = match[1];
            if (!python && NON_SOURCE_ASSET.test(specifier) && !SOURCE_EXTENSION.test(specifier))
                continue;
            const target = python ? pythonTarget(specifier, path) : normalize(`${directoryOf(path)}/${specifier}`);
            if (resolves(target))
                continue;
            // A directory the repository knows about, whose entry file was filtered out
            // of this scan (a test helper, an asset), is not evidence of a mirage.
            if ([...present].some((file) => file.startsWith(`${target}/`) || file.startsWith(`${target}.`)))
                continue;
            const line = lineNumberAt(content, (match.index ?? 0) + match[0].indexOf(specifier));
            if (isIncluded(line, diff))
                findings.push(makeFinding(this, path, line, lineText(content, line)));
        }
        return findings;
    },
};
//# sourceMappingURL=phantom-import.js.map