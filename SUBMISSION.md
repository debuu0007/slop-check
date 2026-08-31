# The WebMCP Challenge — submission notes

Paste-ready text for the Devpost form, plus the record the rules ask for
distinguishing prior work from work done during the submission period.

- **Live URL:** https://slop-check-nine.vercel.app/
- **Repository:** https://github.com/debuu0007/slop-check
- **License:** MIT ([`LICENSE`](./LICENSE))
- **Demo video:** _(fill in — public YouTube, ≤3 min, with audio)_

---

## Inspiration

Every code review tool that touches AI-generated code has the same problem: it
can find the patterns, but it cannot tell you whether a given instance is a
mistake. `// In a real implementation, validate this` is nearly always slop. An
empty `catch` on a teardown path is nearly always deliberate. The difference is
not in the source text — it is in what the author was trying to do, and only a
person who knows the codebase can supply that.

So slop-check does not guess. Twelve deterministic rules, no model, every hit
quoted with a file and line. The tool finds; the human judges. That division
turned out to be exactly the shape WebMCP is for.

## What it does

slop-check scores a repository, a pull request, or a diff for the patterns
AI-assisted code uses to *perform* doneness — the comment that describes the
validation instead of doing it, the `catch` that files the error somewhere quiet,
the config that moved in and started receiving mail. Findings come back as a deck
of cards you swipe: left accepts the finding, right calls it a false positive.
Disputed cards come back out as `slop-disable` directives you paste into the
code, which the CLI and the GitHub Action then honour on every later run.

With WebMCP, an agent can operate all of that with you. In ChatGPT's browser:

> *"Scan github.com/owner/repo with slop-check, show me every swallowed-error
> finding, and explain why the rule counts."*

The page runs the scan in front of you. The agent reads the receipts back. You
decide each verdict — and when you disagree, the agent hands you the exact
directives to paste.

## Why WebMCP fits this use case

Three reasons, in order of how much they mattered.

**The work splits cleanly along the human/agent line.** Scanning, filtering,
paging and explaining are mechanical; the verdict is not. Most agent integrations
have to decide how much autonomy to hand over, and get it wrong in one direction
or the other. Here the boundary was already in the product before WebMCP existed.
The tools follow it exactly: the agent may scan, read and explain freely, and
`judge_finding` is documented as something to ask about first, because the verdict
is the user's contribution and taking it from them removes the point of the tool.

**The analysis is local, so the agent gets the real thing.** Every rule runs in a
Web Worker in the tab. There is no server, no upload and no API key. An agent
calling `scan_repository` gets the same deterministic result the button produces,
on code that never left the browser — which is the property that made people
willing to point this at private work in the first place, and WebMCP preserves it
where a server-side MCP integration would have destroyed it.

**The output is already structured.** A finding has a rule, a file, a line, a
weight and a quoted snippet. It needed no reshaping to become `structuredContent`.

## How it improves the experience

Before, the honest workflow was: open the site, paste a URL, wait, then read a
few hundred findings and swipe through ten of them. The scanner had no idea what
you cared about, so the deck sampled across rules and hoped.

Now you can say what you care about. *"Only the swallowed errors."* *"Skip
anything under `test/`."* *"Explain this rule before I decide."* The agent
narrows a few hundred findings to the dozen worth your judgment, and you spend
your attention on the part that actually needs a human. At the end,
`export_suppressions` closes the loop back into your editor.

The part we care most about: **none of it is invisible.** A tool-driven scan
fills the visible input, flips the visible tab and runs the same progress panel a
click does. `judge_finding` moves the actual card on screen. Someone watching the
page can see everything the agent did, because the agent is pressing the same
buttons they would have.

## What people and agents accomplish together

A calibrated review neither could produce alone. The agent brings patience across
hundreds of findings and instant recall of twelve rule definitions. The person
brings the only thing that converts a finding into a decision: knowing why the
code is like that. The artefact they produce jointly — a set of `slop-disable`
directives with a human verdict behind each one — is a durable record of that
judgment which the CLI and CI honour from then on. The next scan is quieter
because a person decided something, and the agent wrote it down.

## How we built it

**WebMCP implementation.** [`web/webmcp.ts`](./web/webmcp.ts) registers seven
tools with `document.modelContext.registerTool()`. Three things are deliberate:

1. **One shared state.** The tool layer owns no state. It is handed a small handle
   assembled in [`web/main.ts`](./web/main.ts) out of the same functions the click
   handlers call — `runScan`, `judgeGroup`, `disputedSnippet`. There is no second
   code path and therefore no way for an agent to reach a result the page is not
   displaying, or record a verdict the deck does not reflect.
2. **A live tool set, not a static manifest.** `list_findings`, `judge_finding`
   and `export_suppressions` are meaningless before a scan exists, so they are not
   registered until one lands, and are unregistered when results are cleared —
   using the `AbortSignal` that `registerTool` accepts as its second argument.
   The page emits its own state event; the WebMCP layer syncs registration to it
   and the browser fires `toolchange`. An agent reading the tool list is reading
   the page's actual state.
3. **Honest annotations.** Every tool that can echo code from a scanned repository
   is marked `untrustedContentHint` — a scanned repo can contain a comment written
   to be read as an instruction, and `list_findings` quotes comments verbatim by
   design. Read-only tools carry `readOnlyHint`. Tool errors are returned as
   results with `isError` and a readable reason, so an agent that calls
   `list_findings` too early is told to scan first rather than seeing an opaque
   failure.

Cancellation is threaded end to end: `execute` receives a `signal`, which reaches
`githubFiles` and every `fetch` beneath it, composed with the existing per-request
timeout via `AbortSignal.any`.

**The scanner underneath** is unchanged and has no AI in it: twelve rules over a
syntax-free scan, scored as weighted hits per thousand lines, with repetition
damped so one repeated house idiom cannot fail a codebase on its own. It ships as
a CLI, a GitHub Action and this web app from one TypeScript source.

## Challenges

Getting the agent's reach right was the whole design problem. The first version
let `judge_finding` walk the deck and decide everything, which is technically
better tool use and completely misses the point — an agent that judges every card
has replaced the user rather than helped them. The version that shipped can only
move a card the user can see, one verdict at a time, and its own description tells
the agent to ask first.

The second was ordering: judging out of order. The deck is a stack, but an agent
asking about one specific rule wants that card now. Re-rendering the stack broke
the animation on cards already leaving, so `swapToFront` swaps the rendered
contents of two positions instead — the deck's order is a sampling artefact, not
meaning, so nothing is lost.

## What's next

Cross-origin `exposedTo`, so a code-hosting site could embed the scanner and offer
its tools to the parent page. A `scan_local_files` tool once file access through
WebMCP settles. And output schemas on the remaining tools.

---

## Prior work vs. hackathon work

The rules require pre-existing projects to distinguish prior work from new work
with timestamped commit history. This repository's **entire git history begins
2026-08-30**, after the 2026-08-25 submission-period start, so all of it falls
inside the window. For completeness:

- **Before WebMCP:** the rule engine (`src/`), CLI, GitHub Action, and the web
  app's scanner, deck and share card.
- **Built for this hackathon:** the whole WebMCP layer — `web/webmcp.ts`, the
  `main.ts` refactor that gives the tools the same entry points the buttons use
  (`runScan`, `setMode`, `judgeGroup`, `swapToFront`, `deckState`), `AbortSignal`
  plumbing through `web/github.ts`, the agent-tools section on the page, and
  `test/webmcp.test.ts` (23 tests covering the tool contract and the registration
  lifecycle).

`git log` and the commit touching these files carry the timestamps.
