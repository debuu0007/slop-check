import type { SourceFile } from "./types.js";
export declare function collectFiles(target: string, ignorePatterns?: readonly string[]): Promise<{
    files: SourceFile[];
    skippedFiles: number;
    knownPaths: string[];
}>;
