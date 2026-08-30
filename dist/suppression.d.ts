import type { Finding } from "./types.js";
export type Scope = "next-line" | "line" | "file";
export interface SuppressionResult {
    findings: Finding[];
    suppressed: number;
}
/** Drops findings that the file's disable directives cover, and counts them. */
export declare function applySuppressions(findings: readonly Finding[], contents: ReadonlyMap<string, string>): SuppressionResult;
