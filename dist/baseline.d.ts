import type { AnalysisResult, Finding } from "./types.js";
export interface BaselineEntry {
    ruleId: string;
    path: string;
    snippetHash: string;
}
export declare function baselineEntries(findings: readonly Finding[]): BaselineEntry[];
export declare function writeBaseline(path: string, findings: readonly Finding[]): Promise<void>;
export declare function readBaseline(path: string): Promise<BaselineEntry[] | undefined>;
export declare function applyBaseline(result: AnalysisResult, baseline: readonly BaselineEntry[]): AnalysisResult;
