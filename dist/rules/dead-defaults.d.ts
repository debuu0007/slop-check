import type { Rule } from "../types.js";
export declare const id = "dead-defaults";
export declare const displayName = "The Ghost Param";
export declare const weight = 0.06;
export declare const why = "A default that no caller overrides presents flexibility nobody uses.";
export declare const roasts: readonly ["Configurable in theory, ceremonial in practice.", "The parameter has options. Its callers do not.", "Flexibility has been added for an audience of zero.", "The default is also the only supported value."];
export declare const rule: Rule;
