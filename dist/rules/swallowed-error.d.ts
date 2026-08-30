import type { Rule } from "../types.js";
export declare const id = "swallowed-error";
export declare const displayName = "The Gulp";
export declare const weight = 0.18;
export declare const why = "Failures are caught and discarded without recovery or reporting.";
export declare const roasts: readonly ["The exception has been promoted to a secret.", "Failure is now an undocumented success state.", "The error went somewhere quiet to think.", "Reliable, provided nothing ever goes wrong."];
export declare const rule: Rule;
