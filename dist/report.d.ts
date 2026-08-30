import type { AnalysisResult } from "./types.js";
export interface ReportOptions {
    serious?: boolean;
    explain?: boolean;
    top?: number;
    color?: boolean;
}
export declare function renderPlain(result: AnalysisResult, options?: ReportOptions): string;
export declare function renderTty(result: AnalysisResult, options?: ReportOptions): string;
export declare function renderBadge(result: AnalysisResult): string;
