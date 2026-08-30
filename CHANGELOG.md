# Changelog

## 1.1.0

### Added

- **Inline suppression.** `slop-disable-next-line`, `slop-disable-line`, and `slop-disable-file`, in `//`, `#`, or `/* */` comments, with optional rule ids. Suppression is applied before scoring so a silenced finding cannot move the grade, and the count is reported in both the terminal output and `suppressedFindings` in JSON, so silencing a rule stays visible.
- **`phantom-import` ("The Mirage"), weight 0.22.** Flags relative imports pointing at modules the repository does not contain — the shape a generator produces when it invents the neighbour a file implies should exist. Resolution follows directory indexes and TypeScript's `./parser.js` → `parser.ts` convention. Bare package imports are never flagged, because verifying them needs a registry and this tool stays offline.
- `knownPaths` on the analysis options and rule context: every source path in the project, including files that are not being scored, so import resolution sees the real file listing rather than the filtered one.
- `completeRepository`, an explicit opt-in signal that the path listing is exhaustive. Rules that argue from absence stay silent without it, which keeps them off for diffs, dropped folders, and truncated listings.

### Changed — detection accuracy

Every change below removes findings that were wrong. Verified against a fixed set of real-world lines: 11 known false positives and 9 true positives, 0 misclassified.

- **Test code is no longer scored.** Tests use documentation URLs, let failures throw, and stub freely. Scoring them penalised the projects that test most thoroughly. `tests/`, `__tests__/`, `spec/`, `e2e/`, `fixtures/`, `conftest.py`, `*.test.ts`, `*.spec.js`, and `test_*.py` are recognised, by the CLI and the web app alike, from one shared definition.
- **The Apology** no longer matches a bare `placeholder`, which in front-end code is usually the HTML attribute. A stub word now has to arrive with a claim about the implementation.
- **The Brag** no longer matches quality adjectives used descriptively. It requires the comment to lead with the praise, claim a state, or apply the adjective to the code itself.
- **The Squatter** ignores addresses reserved for documentation and examples (RFC 2606, RFC 6761) and namespace URIs, and no longer counts unquoted integers, which were almost always timeouts.
- **The Silencer** no longer reports an empty catch that carries an explanation. A documented best-effort catch is a decision, not a shrug.
- **The Ghost Param** skips indented declarations, whose callers may be subclasses or a framework rather than named call sites.
- **Sunshine Code** no longer treats a method *named* `fetch` or `open` as a call to one, which had been flagging HTTP client libraries once per method they define.
- Call-site indexing now matches one level of nested parentheses and counts arity at the top level only. `connect(host, port(1))` previously went unmatched, so an overridden default looked dead.

### Changed — performance

- A repository scan in the web app costs one GitHub API request instead of two; the tree endpoint accepts `HEAD` directly, so there is no second call to read the default branch. Measured across five repositories: 3733 ms → 1793 ms.
- Fetched files are cached by git blob SHA. Because a blob SHA is a content hash, an entry can never go stale, and rescanning a repository re-fetches nothing: 6839 ms and 80 requests → 123 ms and 1 request.
- Line lookups use a cached offset table and binary search instead of slicing and re-splitting file content per match. Analysis of 135k lines: 194 ms → 141 ms.
- Removed a quadratic lookup in `duplicate-helper` and a per-changed-line re-split in the repository index.
- Fetch progress is throttled rather than writing to the DOM once per completed file.

### Fixed

- The CLI walker and the browser loader now share one definition of what a repository contains. They had drifted, so the same repository could score differently depending on which one you asked.
