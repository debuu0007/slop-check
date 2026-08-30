import type { Rule } from "../types.js";
export declare const id = "deletion-flag";
export declare const displayName = "The Vanishing";
export declare const weight = 0.2;
export declare const why = "Deleted tests, validation, or guards can remove safety without replacing it.";
export declare const roasts: readonly ["The safety check has been optimized away.", "Less code. Also fewer guarantees.", "The guardrail was blocking the happy path.", "Coverage improved by reducing the things being covered."];
export declare const rule: Rule;
