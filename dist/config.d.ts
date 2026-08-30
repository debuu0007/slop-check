export interface SlopConfig {
    ignore?: string[];
    "fail-over"?: number;
    serious?: boolean;
    weights?: Record<string, number>;
    top?: number;
}
export declare function loadConfig(directory: string): Promise<SlopConfig>;
