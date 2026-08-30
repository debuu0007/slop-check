import type { Rule } from "../types.js";
export declare const id = "phantom-import";
export declare const displayName = "The Mirage";
export declare const weight = 0.22;
export declare const why = "A relative import points at a module the repository does not contain.";
export declare const roasts: readonly ["The module was imagined with great confidence.", "Imported from a repository that exists in another timeline.", "The dependency is load-bearing and also fictional.", "Somewhere, this file almost certainly exists."];
export declare const rule: Rule;
