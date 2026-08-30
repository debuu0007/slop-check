import type { DiffContext, RepoIndex, SourceFile } from "./types.js";
/**
 * Quoted only. An unquoted 30000 is almost always a timeout or a buffer size, and
 * counting bare integers made the rule fire on arithmetic.
 */
export declare const configLiteralPattern: RegExp;
/** True when a matched literal is a documentation or namespace constant, not configuration. */
export declare function isReservedLiteral(value: string): boolean;
/** Argument count, ignoring commas nested inside parentheses, brackets, or braces. */
/**
 * Splitting an argument or parameter list on bare commas is wrong twice over: a
 * comma inside `dict[str, Any]` starts no new entry, and neither does one inside
 * the string literal in `delim: str = ", "`. Both were shredding real signatures
 * into phantom entries, which is how a parameter every caller overrides came to be
 * reported as one nobody uses.
 */
export declare function splitTopLevel(list: string): string[];
export declare function buildRepoIndex(files: readonly SourceFile[], contexts?: ReadonlyMap<string, DiffContext>): RepoIndex;
