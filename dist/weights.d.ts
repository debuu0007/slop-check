/** One hit's contribution before normalization by effective KLOC. */
export declare const weights: {
    readonly "apology-comments": 0.1;
    readonly "empty-catch": 0.16;
    readonly "swallowed-error": 0.18;
    readonly "any-flood": 0.08;
    readonly "hardcoded-config": 0.06;
    readonly "duplicate-helper": 0.12;
    readonly "happy-path-only": 0.12;
    readonly "dead-defaults": 0.06;
    readonly "deletion-flag": 0.2;
    readonly "debug-residue": 0.04;
    readonly "enhancement-theater": 0.04;
    readonly "phantom-import": 0.22;
};
export type RuleId = keyof typeof weights;
