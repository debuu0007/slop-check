import { findingsFromRegex } from "./shared.js";
export const id = "enhancement-theater";
export const displayName = "The Brag";
export const weight = 0.04;
export const why = "A quality adjective in a comment is not a quality property in the code.";
export const roasts = [
    "The code has reviewed itself and found itself excellent.",
    "Production readiness has been declared by comment.",
    "The adjective is doing most of the engineering.",
    "Comprehensive, in the narrowest possible sense.",
];
/**
 * These adjectives are only a brag when they are applied to this code. Used
 * descriptively they are ordinary English, and matching them bare made the rule
 * fire on prose: "robust for dynamic SPAs with menus", "Log a comprehensive
 * summary of the next action", "The robust fix is to ship a real Node runtime".
 *
 * What separates a brag is position and grammar, not vocabulary. Three forms
 * qualify: the comment opens by praising itself, it makes an explicit claim about
 * the state of the code, or the adjective modifies the code itself rather than
 * something the code produces. See the fixtures for worked examples.
 */
const adjective = "robust|comprehensive|production[- ]ready|enterprise[- ]grade|battle[- ]tested|bulletproof|rock[- ]solid";
const opener = ["//+", "/\\*+", "#+", "\\*", "'''", '"""'].join("|");
const artifact = "implementation|solution|error handling|handling|handler|parser|validation|version|system|approach|coverage|support|logic";
const expression = new RegExp(`^[ \\t]*(?:${opener})[ \\t]*(?:`
    // The comment leads with the adjective, as in the positive fixture.
    + `(?:${adjective})\\b`
    // An explicit claim about the state of the code.
    + `|[^\\n]*\\b(?:is|are)\\s+(?:now\\s+)?(?:fully\\s+)?(?:${adjective})\\b`
    // The adjective modifies the code itself, not something the code produces.
    + `|[^\\n]*\\b(?:${adjective})\\s+(?:${artifact})\\b`
    + `)`, "gim");
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        return findingsFromRegex(this, path, content, expression, diff);
    },
};
//# sourceMappingURL=enhancement-theater.js.map