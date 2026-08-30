# slop-check

[![slop-check grade B](./slop-check.svg)](#dogfood)

Point it at a diff or a repository. It flags the exact patterns AI-generated code uses to look finished without being finished.
You get a 0–100 score, a quotable grade, and every receipt as `file:line` plus the matched source.
Catching AI slop requires zero AI. It is grep with taste: instant, deterministic, private, and fully offline.

![slop-check scans a deliberately sloppy fixture, then scans itself](./assets/demo.gif)

## Install and run

Requires Node.js 18 or later.

```bash
npx slop-check .
git diff | npx slop-check --diff
npx slop-check . --json --fail-over 40
npx slop-check . --badge > slop-check.svg
```

The CLI scans JavaScript, TypeScript, and Python. Other languages, dependencies, build output, lockfiles, generated code, minified files, vendored code, and `.git` are skipped silently.

Test code is skipped, and so are `examples/`, `samples/`, `docs/`, and `demos/`. Both are written against different rules than production code: fixtures use documentation URLs, examples hardcode the endpoint they are demonstrating, and a stub with no error handling is the point rather than an oversight. Scoring them penalises the projects that test and document most thoroughly, which is backwards.

| Option | What it does |
|---|---|
| `--diff` | Reads a unified diff from stdin and scores only added or changed lines. Meaningful deleted safety lines are still reported. |
| `--json` | Prints stable, deterministic JSON for CI and integrations. |
| `--fail-over <n>` | Exits with status 1 when the score is at least `n`. |
| `--badge` | Writes a standalone shields-style SVG to stdout. |
| `--baseline` | Writes `.slop-baseline.json`; later runs report and fail only on new findings. |
| `--serious` | Omits the deadpan roast from findings. |
| `--explain` | Shows the exact scoring arithmetic, including any repetition damping. |
| `--top <n>` | Limits the displayed groups without changing the score. |

Every JSON finding includes `path`, `line`, `snippet`, stable rule metadata, weight, and the deterministically selected roast. Repeated runs over identical input are byte-identical.

### Baseline existing findings

Adopt slop-check on a legacy repository without accepting new debt:

```bash
npx slop-check . --baseline
npx slop-check . --fail-over 40
```

The baseline stores only rule id, path, and a normalized snippet hash — never line numbers — so findings stay baselined when nearby code moves.

## Calibration

A linter nobody trusts gets disabled, so the honest measure of this tool is not how much it finds but how much of what it finds is real. It is measured against repositories whose code is known to be good, on the theory that **a scanner's most important property is staying quiet when nothing is wrong**.

The corpus that produced the current numbers:

| Repository | Findings before | Findings after | Grade |
|---|---:|---:|:---:|
| [`openai/openai-python`](https://github.com/openai/openai-python) — 1,542 files | 61 | **12** | A |
| This repository | 4 | **2** | B |

Six rule defects were found by reading every finding on `openai-python` by hand and asking whether a maintainer would act on it. None of them would have surfaced from unit tests, because each rule passed its own fixtures:

- **`dead-defaults` mis-parsed every signature it read.** Parameter lists were split on bare commas, so a comma inside `dict[str, Any]` or inside the string in `delim: str = ", "` invented parameters that were never there. `*` was counted as a parameter. Only positional arity was compared, so `f(deep=True)` — the ordinary way to override a keyword-only default — did not count as overriding it. The rule reported "no caller overrides this" about a function whose caller overrode it eight lines away.
- **`dead-defaults` made an unprovable claim.** "No caller in this repository" says nothing about a published package, whose callers are other people's code. It now only fires on provably file-local symbols: unexported in JS and TS, underscore-prefixed in Python.
- **`happy-path-only` matched any method named `open`.** `\bopen(` caught `tarfile.open()`, `Path(...).open()`, and `wave.open()`. It also read every `with open(...)` as unhandled I/O, when a context manager *is* the failure path and letting the error propagate is correct in a library.
- **`duplicate-helper` flagged sync/async twins.** Python cannot express one function that works in both contexts, so every async library ships `f` beside `async_f` at 95% similarity. That is a language constraint, not a helper someone rediscovered.
- **`swallowed-error` flagged `__del__`.** Suppressing exceptions during finalization is correct Python — the interpreter discards them anyway, and letting one escape only prints noise during garbage collection. The tool was asking for the code to be made worse.
- **Every rule read prose as code.** A rule that matches source text will happily match a sentence describing the pattern it looks for. This repository scored itself a grade worse because two of its own explanatory comments contain `.catch(() => {})`. Comments are now masked before matching, with string literals tracked so a `//` inside a URL is not mistaken for a comment.

Each case is pinned in [`test/false-positives.test.ts`](./test/false-positives.test.ts), which exists specifically to keep fixed rules fixed.

### What this does not claim

slop-check cannot tell you that code was written by an AI, and does not try to. There is no reliable signal for authorship in source text, and any tool claiming otherwise is guessing. What it measures is whether a codebase carries the *patterns* that AI-assisted code carries more often — swallowed failures, apologetic comments, config that settled in place. A human can write all of them, and frequently does.

Read the score as a description of the code, never as an accusation about who wrote it.

### Known gaps

Being specific about what is still wrong is more useful than a precision number:

- **`hardcoded-config` is the noisiest rule.** It flags `process.env.SITE_URL || 'https://example.com'` — a literal in an environment-variable fallback, which is the configuration it is asking for. It flags a project's own canonical URL, which legitimately belongs in a sitemap or a framework config. It flags fixed third-party endpoints, which are not deployment config. Next on the list.
- **`swallowed-error` cannot distinguish recovery from silence.** `.catch(() => null)` whose value is assigned and branched on is a fallback; a bare `.catch(() => {})` as a statement is a shrug. Both are currently reported.
- **The rule set came from intuition, not data.** [Empirical work on LLM code smells](https://arxiv.org/html/2510.03029) finds magic numbers, missing documentation, and alignment most over-represented — which barely overlaps with these twelve rules. Their method is also the right one and is not used here yet: compare a codebase's smell *profile* against a human-written baseline instead of scoring it in isolation.

## Grades

| Score | Grade | Label |
|---:|:---:|---|
| 0–9 | **A** | Shipped by a human. Probably. |
| 10–24 | **B** | Some assembly required. |
| 25–44 | **C** | The code is doing its best. |
| 45–69 | **D** | This code is apologizing to you. |
| 70–100 | **F** | `// TODO: write the actual product` |

The formula is deliberately boring and inspectable:

```text
score = min(100, 100 × Σ(rule weight × damped hits) / max(effective lines, 420) / 1000)
```

Repository mode uses scanned source lines. Diff mode uses touched lines. Samples below 420 lines are scored as 0.420 KLOC so one low-weight finding cannot turn a tiny change into an automatic F.

**Damped hits** are the reason a house idiom cannot single-handedly fail a repository. A codebase that writes `.catch(() => {})` on forty teardown paths has made one stylistic decision, however many times it was typed; charging it forty times is the failure a linter has when no rule is capped. The first five hits of a rule count in full, and further hits accrue logarithmically. Distinct rules still stack fully, because twelve different problems genuinely are worse than twelve copies of one. `--explain` prints both the damped and raw totals.

Findings are also **grouped by rule and file**, so forty instances of one snippet read as one receipt with a count rather than forty walls of the same line.

## Rules

| Stable id | Display name | Weight | Why it is a tell |
|---|---|---:|---|
| `phantom-import` | **The Mirage** | 0.22 | A relative import points at a module the repository does not contain. |
| `deletion-flag` | **The Vanishing** | 0.20 | Deleted tests, validation, flags, or guards can quietly remove safety. |
| `swallowed-error` | **The Gulp** | 0.18 | Failures are caught and discarded without recovery or reporting. |
| `empty-catch` | **The Silencer** | 0.16 | An error handler that cannot affect behavior only hides evidence. |
| `duplicate-helper` | **Déjà Vu** | 0.12 | Near-identical helpers multiply maintenance without adding behavior. |
| `happy-path-only` | **Sunshine Code** | 0.12 | Fallible async or I/O work has no visible failure path. |
| `apology-comments` | **The Apology** | 0.10 | The code narrates the implementation it chose not to contain. |
| `any-flood` | **Type Amnesia** | 0.08 | Repeated escape hatches erase TypeScript's guarantees. |
| `hardcoded-config` | **The Squatter** | 0.06 | Repeated environment-specific literals quietly become configuration. |
| `dead-defaults` | **The Ghost Param** | 0.06 | A default no caller overrides presents flexibility nobody uses. |
| `debug-residue` | **The Breadcrumb** | 0.04 | Temporary probes and large commented blocks mark unfinished cleanup. |
| `enhancement-theater` | **The Brag** | 0.04 | A quality adjective in a comment is not a quality property in code. |

Detection is regex plus light repository heuristics. `duplicate-helper` compares normalized token shingles; no parser, model, telemetry, or network request is involved.

`phantom-import` resolves every relative specifier against the files actually present, following the usual conventions: directory indexes, and TypeScript's habit of importing `./parser.js` to mean `parser.ts`. Bare package imports are never flagged, because confirming that `requests` exists would need a registry lookup, which is neither offline nor deterministic.

Because it argues from a file's *absence*, it only runs when the caller can guarantee it is holding the whole project. A directory scan qualifies. A diff, a dropped folder, an `ignore` list, or a sample of a repository larger than the web app's cap does not, and the rule stays silent rather than reporting every import into the part it cannot see.

## Configuration

An optional `.slopcheckrc` is JSON with no more than these five keys:

```json
{
  "ignore": ["legacy/vendor/**"],
  "fail-over": 40,
  "serious": true,
  "weights": { "debug-residue": 0.02 },
  "top": 20
}
```

CLI flags override the corresponding file settings.

## Suppressing a finding

Sometimes the tool is wrong, or the pattern is deliberate. Say so in place:

```ts
// slop-disable-next-line empty-catch
try { await flush(); } catch {}

await flush().catch(() => {});  // slop-disable-line swallowed-error
```

```python
# slop-disable-file dead-defaults
```

`slop-disable-next-line` covers the following line, `slop-disable-line` the line it sits on, and `slop-disable-file` the entire file. List rule ids separated by spaces or commas to cover only those; a directive with no ids covers every rule in its scope. `//`, `#`, and `/* */` comments all work.

Suppression happens before scoring, so a suppressed finding cannot influence the grade. Every report states how many findings were suppressed, and the count appears in `--json` as `suppressedFindings`, so silencing a rule stays visible rather than becoming a quiet way to improve a score.

## Badge

```bash
npx slop-check . --badge > slop-check.svg
```

```markdown
![slop-check grade](./slop-check.svg)
```

The badge is generated locally. It does not depend on shields.io or another service.

## GitHub Action

The included action analyzes the pull request diff, emits inline workflow annotations, updates one sticky comment identified by its own marker, and blocks the check at your threshold.

```yaml
name: slop-check
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  receipts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: debuu0007/slop-check@v1
        with:
          fail-over: 40
          serious: true
```

## Web app

The Vite app is static: paste a diff, drop local source files, or enter a public GitHub repository or pull request URL. Analysis runs in a Web Worker, and nothing leaves the tab.

A repository scan costs exactly **one** GitHub API request. The tree endpoint accepts `HEAD` directly, so there is no second call to resolve the default branch, and it returns the entire repository listing in that one response. Source contents come from jsDelivr rather than the API, so file count is unrelated to GitHub's 60-request anonymous hourly budget — the cap is 600 files, and analysis is not the constraint either: 1,000 files of TypeScript score in about 115 ms. Fetched files are cached by their git blob SHA, which is a content hash and therefore can never go stale, so rescanning a repository re-fetches nothing.

Results are shown as a **deck** — one card per rule-and-file group, rotating between rules so the loudest idiom cannot fill it — or as a flat list. Swiping a card left accepts the finding and right disputes it; disputed cards come back out as ready-to-paste `slop-disable-next-line` directives. Share summaries are encoded in the URL hash so a card can be reopened without a backend.

```bash
npm run build:web
```

Deploys to Vercel as configured in [`vercel.json`](./vercel.json), or publish `web-dist/` to any static host. The share card reads its own origin, so no domain is hardcoded.

## PR a rule in one file

Seen a new AI tell? Add one pure rule module under `src/rules/` and one line to `src/rules/index.ts`. A rule exports `id`, `displayName`, `weight`, `why`, `roasts`, and:

```ts
(path: string, content: string, diff?: DiffContext) => Finding[]
```

Add positive and negative fixtures for each applicable language. Both CLI and web consumers receive the rule from the same registry.

Two things a new rule must do, learned the hard way and documented above under [Calibration](#calibration):

- Call `maskComments(content, path)` before matching source text, unless the rule is specifically about comments. Otherwise it will match sentences describing the pattern it hunts.
- A rule that concludes something from a file's *absence* must check `diff.repositoryComplete` first and resolve against `diff.knownPaths`. Without that guard it reports the part of the repository it was never shown.

## Dogfood

The committed badge is the output of this repository scanning itself. The demo's deliberately sloppy fixture is excluded through `.slopcheckrc`; test fixtures and examples are skipped automatically; product source is not excluded at all. The final gate is:

```bash
npm run check
npx slop-check .
git diff | npx slop-check --diff
```

Current result: **B — Some assembly required.**

Both findings are real, and both are in `web/github.ts`: the browser cache falls back with `.catch(() => undefined)` on read and on write, because a cache miss and a cache failure should behave identically. The tool has no way to know that, which is exactly the argument for `slop-disable-line` existing — and exactly the reason those two are left in place rather than silenced.

MIT © slop-check contributors
