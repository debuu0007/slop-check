import type { DiffContext, SourceFile } from "./types.js";
export interface ParsedDiff {
    files: SourceFile[];
    contexts: Map<string, DiffContext>;
}
export declare function parseUnifiedDiff(input: string): ParsedDiff;
