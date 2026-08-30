export { isSupported, isTypeScript } from "../paths.js";
const lineIndexCache = [];
function buildLineIndex(content) {
    const offsets = [0];
    const lines = [];
    let start = 0;
    for (let position = content.indexOf("\n"); position >= 0; position = content.indexOf("\n", start)) {
        lines.push(content.slice(start, position));
        start = position + 1;
        offsets.push(start);
    }
    lines.push(content.slice(start));
    return { offsets, lines };
}
function lineIndexFor(content) {
    for (const entry of lineIndexCache)
        if (entry.content === content)
            return entry.index;
    const index = buildLineIndex(content);
    lineIndexCache.unshift({ content, index });
    lineIndexCache.length = Math.min(lineIndexCache.length, 2);
    return index;
}
export function lineNumberAt(content, index) {
    const { offsets } = lineIndexFor(content);
    let low = 0, high = offsets.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (offsets[middle] <= index)
            low = middle;
        else
            high = middle - 1;
    }
    return low + 1;
}
/** Every line of the file, split once and reused across rules. */
export function contentLines(content) {
    return lineIndexFor(content).lines;
}
export function closingBrace(content, opening) {
    let depth = 0, quote = "", lineComment = false, blockComment = false;
    for (let index = opening; index < content.length; index += 1) {
        const character = content[index], next = content[index + 1];
        if (lineComment) {
            if (character === "\n")
                lineComment = false;
            continue;
        }
        if (blockComment) {
            if (character === "*" && next === "/") {
                blockComment = false;
                index += 1;
            }
            continue;
        }
        if (quote) {
            if (character === "\\") {
                index += 1;
                continue;
            }
            if (character === quote)
                quote = "";
            continue;
        }
        if (character === "/" && next === "/") {
            lineComment = true;
            index += 1;
            continue;
        }
        if (character === "/" && next === "*") {
            blockComment = true;
            index += 1;
            continue;
        }
        if (character === "'" || character === '"' || character === "`") {
            quote = character;
            continue;
        }
        if (character === "{")
            depth += 1;
        if (character === "}" && --depth === 0)
            return index;
    }
    return -1;
}
/**
 * Comments replaced by spaces, keeping every offset so line numbers still resolve.
 *
 * A rule that matches source text will happily match a sentence describing the
 * pattern it looks for. This repository scored itself a grade worse because two of
 * its own explanatory comments contain a swallowed promise, and a scan of a real
 * project reported a banner comment reading "page metadata fetch (title...)" as
 * unguarded I/O. Prose is not code, and a rule reading it is reading the docs.
 *
 * String literals are tracked so that a `//` inside a URL is not mistaken for the
 * start of a comment - which would blank the rest of the line and hide real code.
 */
export function maskComments(content, path) {
    const python = /\.py$/i.test(path);
    const out = content.split("");
    const blank = (index) => { if (out[index] !== "\n")
        out[index] = " "; };
    const TRIPLES = ['"""', "'''"];
    let quote = "", tripleQuote = "";
    for (let index = 0; index < content.length; index += 1) {
        const character = content[index], next = content[index + 1];
        if (tripleQuote) {
            if (content.startsWith(tripleQuote, index)) {
                index += tripleQuote.length - 1;
                tripleQuote = "";
            }
            continue;
        }
        if (quote) {
            if (character === "\\") {
                index += 1;
                continue;
            }
            if (character === quote || character === "\n")
                quote = "";
            continue;
        }
        if (python) {
            const triple = TRIPLES.find((candidate) => content.startsWith(candidate, index));
            if (triple) {
                tripleQuote = triple;
                index += 2;
                continue;
            }
        }
        if (character === '"' || character === "'" || (!python && character === "`")) {
            quote = character;
            continue;
        }
        if (python ? character === "#" : character === "/" && next === "/") {
            while (index < content.length && content[index] !== "\n")
                blank(index++);
            continue;
        }
        if (!python && character === "/" && next === "*") {
            while (index < content.length && !(content[index] === "*" && content[index + 1] === "/"))
                blank(index++);
            blank(index);
            blank(index + 1);
            index += 1;
            continue;
        }
    }
    return out.join("");
}
export function lineText(content, line) {
    return contentLines(content)[line - 1]?.trim().slice(0, 240) ?? "";
}
function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}
export function makeFinding(rule, path, line, snippet) {
    const roast = rule.roasts[hash(`${path}:${line}`) % rule.roasts.length] ?? "";
    return {
        ruleId: rule.id,
        displayName: rule.displayName,
        path,
        line,
        snippet: snippet.trim().slice(0, 240),
        weight: rule.weight,
        why: rule.why,
        roast,
    };
}
export function isIncluded(line, diff) {
    return !diff?.changedLines || diff.changedLines.has(line);
}
export function findingsFromRegex(rule, path, content, expression, diff) {
    const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
    const regex = new RegExp(expression.source, flags);
    const findings = [];
    for (const match of content.matchAll(regex)) {
        const line = lineNumberAt(content, match.index ?? 0);
        if (isIncluded(line, diff))
            findings.push(makeFinding(rule, path, line, lineText(content, line)));
    }
    return findings;
}
//# sourceMappingURL=shared.js.map