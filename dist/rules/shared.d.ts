import type { DiffContext, Finding, Rule } from "../types.js";
export { isSupported, isTypeScript } from "../paths.js";
export declare function lineNumberAt(content: string, index: number): number;
/** Every line of the file, split once and reused across rules. */
export declare function contentLines(content: string): readonly string[];
export declare function closingBrace(content: string, opening: number): number;
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
export declare function maskComments(content: string, path: string): string;
export declare function lineText(content: string, line: number): string;
export declare function makeFinding(rule: Pick<Rule, "id" | "displayName" | "weight" | "why" | "roasts">, path: string, line: number, snippet: string): Finding;
export declare function isIncluded(line: number, diff?: DiffContext): boolean;
export declare function findingsFromRegex(rule: Rule, path: string, content: string, expression: RegExp, diff?: DiffContext): Finding[];
