import { closingBrace, contentLines, lineNumberAt } from "./rules/shared.js";
/**
 * Quoted only. An unquoted 30000 is almost always a timeout or a buffer size, and
 * counting bare integers made the rule fire on arithmetic.
 */
export const configLiteralPattern = /(['"])(https?:\/\/[^'"\s]+|(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:3000|5000|8000|8080|10000|30000|60000))\1/g;
/**
 * Addresses that are reserved for documentation and examples (RFC 2606, RFC 6761)
 * are the opposite of environment-specific: they are guaranteed never to be real
 * config. Namespace URIs are identifiers rather than endpoints - a hardcoded
 * "http://www.w3.org/2000/svg" is required to be exactly that string.
 *
 * Before they were excluded these dominated every result measured against real
 * repositories, routinely accounting for more than four fifths of the findings on
 * a project with a thorough test suite.
 */
const RESERVED_HOST = /^(?:https?:\/\/)?(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|invalid|test|localhost\.localdomain)(?:[:/?#]|$)/i;
const NAMESPACE_URI = /^https?:\/\/(?:www\.)?(?:w3\.org|json-schema\.org|schemas?\.|purl\.org|xmlns\.|docbook\.org|apache\.org\/(?:xml|licenses)|opensource\.org|creativecommons\.org|spdx\.org|iana\.org|tools\.ietf\.org|www\.rfc-editor\.org)/i;
/** True when a matched literal is a documentation or namespace constant, not configuration. */
export function isReservedLiteral(value) {
    return RESERVED_HOST.test(value) || NAMESPACE_URI.test(value);
}
const keywords = new Set("as async await break case catch class const continue def delete do else export extends false finally for from function if import in instanceof let new null of pass raise return static super switch this throw true try typeof undefined var void while with yield".split(" "));
function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
}
function tokens(body) {
    return body.toLowerCase()
        .replace(/(['"])((?:\\.|(?!\1).)*)\1/g, (_match, _quote, value) => ` string_${hash(value)} `)
        .replace(/\b\d+(?:\.\d+)?\b/g, (value) => ` number_${value.replace(".", "_")} `)
        .match(/[a-z_$][\w$]*|===|!==|=>|\S/g) ?? [];
}
function functionMetadata(path, name, body, index, content) {
    const bodyTokens = tokens(body);
    const shingles = new Set();
    for (let offset = 0; offset <= bodyTokens.length - 4; offset += 1)
        shingles.add(bodyTokens.slice(offset, offset + 4).join(" "));
    const identifiers = new Set(bodyTokens.filter((token) => /^[a-z_$][\w$]*$/.test(token) && !keywords.has(token) && !token.startsWith("string_") && !token.startsWith("number_")));
    const literalSignature = bodyTokens.filter((token) => token.startsWith("string_") || token.startsWith("number_")).join("|");
    return { path, name, body, index, line: lineNumberAt(content, index), position: -1, shingles, identifiers, literalSignature };
}
/** Argument count, ignoring commas nested inside parentheses, brackets, or braces. */
/**
 * Splitting an argument or parameter list on bare commas is wrong twice over: a
 * comma inside `dict[str, Any]` starts no new entry, and neither does one inside
 * the string literal in `delim: str = ", "`. Both were shredding real signatures
 * into phantom entries, which is how a parameter every caller overrides came to be
 * reported as one nobody uses.
 */
export function splitTopLevel(list) {
    const parts = [];
    let depth = 0, quote = "", current = "";
    for (let index = 0; index < list.length; index += 1) {
        const character = list[index];
        if (quote) {
            current += character;
            if (character === "\\")
                current += list[index += 1] ?? "";
            else if (character === quote)
                quote = "";
            continue;
        }
        if (character === '"' || character === "'" || character === "`") {
            quote = character;
            current += character;
            continue;
        }
        if (character === "(" || character === "[" || character === "{")
            depth += 1;
        else if (character === ")" || character === "]" || character === "}")
            depth -= 1;
        if (character === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }
        current += character;
    }
    if (current.trim())
        parts.push(current.trim());
    return parts;
}
function topLevelArity(argumentList) {
    return splitTopLevel(argumentList).length;
}
/**
 * `f(deep=True)` overrides a default just as surely as passing it positionally, so
 * the names used at a call site have to be recorded alongside the count. Reading
 * arity alone made every keyword-only signature look untouched.
 */
function keywordNames(argumentList) {
    const names = new Set();
    for (const argument of splitTopLevel(argumentList)) {
        const match = /^([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(argument);
        if (match)
            names.add(match[1]);
    }
    return names;
}
function extractFunctions(file) {
    const blocks = [];
    if (/\.py$/i.test(file.path)) {
        const expression = /^(?:async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(?:->[^:]+)?\s*:\s*\n((?:[ \t]+[^\n]*(?:\n|$)){3,})/gm;
        for (const match of file.content.matchAll(expression))
            blocks.push(functionMetadata(file.path, match[1], match[2], match.index ?? 0, file.content));
    }
    else {
        const expression = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
        for (const match of file.content.matchAll(expression)) {
            const index = match.index ?? 0;
            const opening = index + match[0].lastIndexOf("{");
            const closing = closingBrace(file.content, opening);
            const body = closing < 0 ? "" : file.content.slice(opening + 1, closing);
            if (body.split("\n").filter((line) => line.trim()).length >= 5)
                blocks.push(functionMetadata(file.path, match[1] ?? match[2], body, index, file.content));
        }
    }
    return blocks;
}
export function buildRepoIndex(files, contexts) {
    const functions = files.flatMap(extractFunctions).sort((a, b) => `${a.path}:${a.index}`.localeCompare(`${b.path}:${b.index}`));
    const functionsByPath = new Map();
    const shingleOwners = new Map();
    functions.forEach((block, position) => {
        block.position = position;
        const own = functionsByPath.get(block.path) ?? [];
        own.push(block);
        functionsByPath.set(block.path, own);
        for (const shingle of block.shingles) {
            const owners = shingleOwners.get(shingle) ?? [];
            owners.push(position);
            shingleOwners.set(shingle, owners);
        }
    });
    const literalCounts = new Map();
    const callsByName = new Map();
    const literalRegex = new RegExp(configLiteralPattern.source, "g");
    // One level of nesting, because `connect(host, port(1))` was previously not
    // matched at all - so a call that did override a default went uncounted, and the
    // default looked dead. Arity is then counted at the top level only, or the same
    // call would report three arguments instead of two.
    const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    for (const file of files) {
        literalRegex.lastIndex = 0;
        for (const match of file.content.matchAll(literalRegex)) {
            const value = match[2] ?? match[0];
            if (isReservedLiteral(value))
                continue;
            literalCounts.set(value, (literalCounts.get(value) ?? 0) + 1);
        }
        callRegex.lastIndex = 0;
        for (const match of file.content.matchAll(callRegex)) {
            const before = file.content.slice(Math.max(0, (match.index ?? 0) - 12), match.index);
            const call = { path: file.path, index: match.index ?? 0, arity: topLevelArity(match[2]), keywords: keywordNames(match[2]), declaration: /(?:function|def)\s+$/.test(before) };
            const calls = callsByName.get(match[1]) ?? [];
            calls.push(call);
            callsByName.set(match[1], calls);
        }
    }
    const addedNormalizedLines = new Set();
    const byPath = new Map(files.map((file) => [file.path, file]));
    for (const [path, context] of contexts ?? []) {
        const file = byPath.get(path);
        if (!file)
            continue;
        const lines = contentLines(file.content);
        for (const line of context.changedLines ?? []) {
            const normalized = lines[line - 1]?.trim().replace(/\s+/g, " ");
            if (normalized)
                addedNormalizedLines.add(normalized);
        }
    }
    return { functions, functionsByPath, shingleOwners, literalCounts, callsByName, addedNormalizedLines };
}
//# sourceMappingURL=repo-index.js.map