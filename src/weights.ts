/** One hit's contribution before normalization by effective KLOC. */
export const weights = {
  "apology-comments": 0.1,
  "empty-catch": 0.16,
  "swallowed-error": 0.18,
  "any-flood": 0.08,
  "hardcoded-config": 0.06,
  "duplicate-helper": 0.12,
  "happy-path-only": 0.12,
  "dead-defaults": 0.06,
  "deletion-flag": 0.2,
  "debug-residue": 0.04,
  "enhancement-theater": 0.04,
  "phantom-import": 0.22
} as const;

export type RuleId = keyof typeof weights;
