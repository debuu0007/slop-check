import { findingsFromRegex } from "./shared.js";
export const id = "apology-comments";
export const displayName = "The Apology";
export const weight = 0.1;
export const why = "The code narrates the implementation it chose not to contain.";
export const roasts = [
    "It knows. It just doesn't care.",
    "The comment has completed the task on the code's behalf.",
    "A roadmap, conveniently embedded at the scene of the omission.",
    "The implementation sends its regrets.",
];
/**
 * "placeholder" on its own is one of the most common words in front-end code that
 * has nothing to do with unfinished work: it is an HTML input attribute. Matching
 * it bare flagged comments that merely mention that attribute, or describe a
 * default standing in for an unknown value - ordinary code, correctly written.
 *
 * A stub word only signals an apology when it is making a claim about this
 * implementation, so it has to arrive alongside something that says real work is
 * still missing.
 */
const stub = "placeholder|stub|dummy|mock implementation";
const clauses = [
    "in a real implementation",
    "in production (?:you|we) would",
    "simplified for now",
    "for demo purposes",
    "TODO\\s*:\\s*(?:proper|implement|real)",
    "replace (?:this|with) (?:real|actual|the real)",
    "not (?:yet )?implemented(?: yet)?\\b",
    `(?:${stub})[^\\n]{0,40}\\b(?:implementation|for now|until|replace|real |actual|later|instead)`,
    // Tight, because the gap is what disambiguates: a stub word far from the verb is
    // usually describing a value, while one directly after it is an admission.
    `\\b(?:returns?|just|simply|currently|temporarily|for now)\\b[^\\n]{0,15}?(?:${stub})`,
];
const expression = new RegExp(`^[ \\t]*(?://|/\\*+|#|\\*)[^\\n]*(?:${clauses.join("|")})`, "gim");
export const rule = {
    id, displayName, weight, why, roasts,
    check(path, content, diff) {
        return findingsFromRegex(this, path, content, expression, diff);
    },
};
//# sourceMappingURL=apology-comments.js.map