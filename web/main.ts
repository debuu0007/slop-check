import "./style.css";
import { rules, type AnalysisResult, type Finding, type FindingGroup, type SourceFile } from "../src/index.js";
import { VERSION } from "../src/generated-version.js";
import { githubFiles } from "./github.js";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
let mode = "diff";
let droppedFiles: SourceFile[] = [];
let current: AnalysisResult | undefined;
const analysisWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let requestId = 0;

function analyze(payload: { diff?: string; files?: SourceFile[]; skippedFiles?: number; completeRepository?: boolean; knownPaths?: string[] }): Promise<AnalysisResult> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const receive = (event: MessageEvent<{ id: number; result?: AnalysisResult; error?: string }>) => {
      if (event.data.id !== id) return;
      analysisWorker.removeEventListener("message", receive);
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result!);
    };
    analysisWorker.addEventListener("message", receive);
    analysisWorker.postMessage({ id, ...payload });
  });
}

for (const tab of tabs) tab.addEventListener("click", () => {
  mode = tab.dataset.mode ?? "diff";
  tabs.forEach((item) => item.classList.toggle("active", item === tab));
  for (const name of ["diff", "files", "github"]) $(`#${name}-panel`).classList.toggle("hidden", name !== mode);
});

const dropZone = $("#files-panel");
const fileInput = $("#file-input") as HTMLInputElement;
async function loadFiles(list: FileList | File[]) {
  droppedFiles = await Promise.all([...list].filter((file) => /\.(?:[cm]?[jt]sx?|py)$/i.test(file.name)).map(async (file) => ({ path: file.webkitRelativePath || file.name, content: await file.text() })));
  $("#file-summary").textContent = `${droppedFiles.length} source file${droppedFiles.length === 1 ? "" : "s"} ready`;
}
fileInput.addEventListener("change", () => loadFiles(fileInput.files ?? []));
for (const event of ["dragenter", "dragover"]) dropZone.addEventListener(event, (value) => { value.preventDefault(); dropZone.classList.add("drag"); });
for (const event of ["dragleave", "drop"]) dropZone.addEventListener(event, (value) => { value.preventDefault(); dropZone.classList.remove("drag"); });
dropZone.addEventListener("drop", (event) => loadFiles(event.dataTransfer?.files ?? []));

type Tier = "gold" | "steel" | "bronze";
/** Rarity follows the scoring weight, so the shiniest card is always the costliest finding. */
function tierFor(weight: number): Tier { return weight >= 0.18 ? "gold" : weight >= 0.1 ? "steel" : "bronze"; }
function color(score: number) { return score <= 9 ? "#a3ff62" : score <= 24 ? "#c7ef5a" : score <= 44 ? "#ffd166" : score <= 69 ? "#ff934f" : "#ff595e"; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!); }

async function render(result: AnalysisResult, writeHash = true) {
  current = result;
  $("#results").classList.remove("hidden");
  $("#score").textContent = String(result.score);
  $("#grade").textContent = result.grade;
  $("#grade").style.color = color(result.score);
  $("#label").textContent = result.label;
  $("#meter-fill").style.width = `${result.score}%`;
  $("#meter-fill").style.background = color(result.score);
  $("#scan-meta").textContent = `${result.filesScanned} FILES · ${result.linesScanned.toLocaleString()} EFFECTIVE LINES${result.skippedFiles ? ` · ${result.skippedFiles} SKIPPED` : ""}${result.suppressedFindings ? ` · ${result.suppressedFindings} SUPPRESSED` : ""}`;
  const worst = result.files.slice().sort((a, b) => b.findings.length - a.findings.length)[0];
  $("#worst-file").textContent = worst?.findings.length ? `WORST: ${worst.path} (${worst.findings.length})` : "NO FINDINGS";
  const floorNote = result.smallSampleFloorApplied ? " · SMALL-SAMPLE FLOOR APPLIED" : "";
  const dampNote = result.rawWeightedHits > result.weightedHits ? ` · REPETITION DAMPED FROM ${result.rawWeightedHits.toFixed(3)}` : "";
  $("#score-explain").textContent = `${result.score} = 100 × ${result.weightedHits.toFixed(3)} WEIGHTED HITS ÷ ${result.effectiveKloc.toFixed(3)} EFFECTIVE KLOC${floorNote}${dampNote}`;
  $("#finding-count").textContent = `${result.findings.length} FINDING${result.findings.length === 1 ? "" : "S"}`;
  $("#rule-summary").innerHTML = rules.filter((rule) => result.ruleHits[rule.id]).sort((a, b) => result.ruleHits[b.id] - result.ruleHits[a.id]).map((rule) => `<span class="rule-pill">${escapeHtml(rule.displayName)} ×${result.ruleHits[rule.id]}</span>`).join("");
  $("#findings").innerHTML = result.groups.length ? result.groups.slice(0, 60).map(listCard).join("") : `<article class="finding" data-tier="steel"><div class="finding-body"><p>No receipts. Suspiciously clean.</p></div></article>`;
  buildDeck(result.groups);
  await document.fonts.ready;
  drawCard();
  if (writeHash) writeResultHash(result);
  $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function writeResultHash(result: AnalysisResult) {
  const top = rules.filter((rule) => result.ruleHits[rule.id]).sort((a, b) => result.ruleHits[b.id] - result.ruleHits[a.id]).slice(0, 3).map((rule) => [rule.id, result.ruleHits[rule.id]]);
  const funniest = result.findings.filter((finding) => finding.ruleId === "apology-comments").sort((a, b) => a.snippet.length - b.snippet.length)[0] ?? result.findings.slice().sort((a, b) => a.snippet.length - b.snippet.length)[0];
  const state = { score: result.score, grade: result.grade, label: result.label, top, funniest };
  location.hash = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/=+$/, "");
}

async function hydrateHash() {
  if (!location.hash.slice(1)) return;
  try {
    const state = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
    const ruleHits = Object.fromEntries(rules.map((rule) => [rule.id, Number(state.top.find((item: [string, number]) => item[0] === rule.id)?.[1] ?? 0)]));
    const result = { version: VERSION, score: state.score, grade: state.grade, label: state.label, filesScanned: 0, skippedFiles: 0, baselinedFindings: 0, suppressedFindings: 0, linesScanned: 0, effectiveKloc: .42, smallSampleFloorApplied: true, weightedHits: 0, rawWeightedHits: 0, findings: state.funniest ? [state.funniest] : [], groups: [], files: [], ruleHits } as AnalysisResult;
    await render(result, false);
  } catch { location.hash = ""; }
}

/** Whatever host is serving this build, so the card never carries a stale domain. */
function siteName() { return location.hostname === "localhost" ? "slop-check" : location.host; }

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill(); }
function fit(ctx: CanvasRenderingContext2D, value: string, max: number) { let text = value; while (ctx.measureText(text).width > max && text.length > 4) text = `${text.slice(0, -2)}…`; return text; }
function drawCard() {
  if (!current) return;
  const canvas = $("#share-card") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#090b09"; ctx.fillRect(0, 0, 1200, 630);
  const gradient = ctx.createRadialGradient(970, 40, 20, 970, 40, 500); gradient.addColorStop(0, `${color(current.score)}33`); gradient.addColorStop(1, "#090b0900"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#a3ff62"; ctx.fillRect(64, 58, 20, 20); ctx.fillStyle = "#f4f1e8"; ctx.font = "500 25px monospace"; ctx.fillText(siteName(), 100, 77);
  if (($("#confession") as HTMLInputElement).checked) { ctx.fillStyle = color(current.score); rounded(ctx, 792, 50, 344, 44, 22); ctx.fillStyle = "#10120f"; ctx.font = "700 17px monospace"; ctx.textAlign = "center"; ctx.fillText("YES, I WROTE THIS WITH AI", 964, 79); ctx.textAlign = "left"; }
  ctx.fillStyle = color(current.score); ctx.font = "800 280px Inter, sans-serif"; ctx.fillText(current.grade, 54, 356);
  if (verdicts.length) { let owned = 0, disputed = 0; deck.forEach((group, index) => { if (verdicts[index] === "guilty") owned += group.count; else if (verdicts[index] === "dispute") disputed += group.count; }); ctx.fillStyle = "#8b9187"; ctx.font = "500 17px monospace"; ctx.fillText(`OWNED ${owned}  ·  DISPUTED ${disputed}`, 64, 404); }
  ctx.fillStyle = "#747a71"; ctx.font = "500 18px monospace"; ctx.fillText("SLOP SCORE", 400, 164); ctx.fillStyle = "#f4f1e8"; ctx.font = "800 78px Inter, sans-serif"; ctx.fillText(`${current.score}`, 396, 244); ctx.fillStyle = "#747a71"; ctx.font = "500 17px monospace"; ctx.fillText("/ 100", 500, 240);
  ctx.fillStyle = "#f4f1e8"; ctx.font = "700 31px Inter, sans-serif"; ctx.fillText(fit(ctx, current.label, 680), 400, 306);
  ctx.fillStyle = "#252925"; rounded(ctx, 400, 342, 730, 12, 6); ctx.fillStyle = color(current.score); rounded(ctx, 400, 342, Math.max(8, 730 * current.score / 100), 12, 6);
  const topRules = rules.filter((rule) => current!.ruleHits[rule.id]).sort((a, b) => current!.ruleHits[b.id] - current!.ruleHits[a.id]).slice(0, 3);
  ctx.font = "500 16px monospace"; topRules.forEach((rule, index) => { ctx.fillStyle = "#92978f"; ctx.fillText(`${rule.displayName.toUpperCase()}  ×${current!.ruleHits[rule.id]}`, 400 + index * 245, 405); });
  const funniest = current.findings.filter((finding) => finding.ruleId === "apology-comments").sort((a, b) => a.snippet.length - b.snippet.length)[0] ?? current.findings.slice().sort((a, b) => a.snippet.length - b.snippet.length)[0];
  ctx.fillStyle = "#151815"; rounded(ctx, 64, 452, 1072, 108, 8); ctx.fillStyle = "#697067"; ctx.font = "500 14px monospace"; ctx.fillText(funniest ? `${funniest.path}:${funniest.line}` : "no findings", 88, 485); ctx.fillStyle = "#dce1d8"; ctx.font = "500 18px monospace"; ctx.fillText(fit(ctx, funniest?.snippet ?? "Shipped by a human. Probably.", 1000), 88, 523);
  ctx.fillStyle = "#656b63"; ctx.font = "500 14px monospace"; ctx.textAlign = "right"; ctx.fillText("OFFLINE · DETERMINISTIC · NO AI", 1136, 604); ctx.textAlign = "left";
}

/* ── The deck ─────────────────────────────────────────────────────────────────
   Swiping only earns its place if the swipe decides something, so the two
   directions are a plea: left accepts the finding, right calls it a false
   positive. Disputed cards come back out as slop-disable directives, which is
   the same escape hatch src/suppression.ts already honours on the CLI side.  */

const DECK_SIZE = 10;
const SWIPE_THRESHOLD = 110;
type Verdict = "guilty" | "dispute";

const deckEl = $("#deck");
let deck: FindingGroup[] = [];
let cursor = 0;
let verdicts: Verdict[] = [];
let deckOverflow = 0;

const INSTANCES_SHOWN = 3;

function instanceRows(group: FindingGroup) {
  const shown = group.findings.slice(0, INSTANCES_SHOWN);
  const rest = group.count - shown.length;
  return `${shown.map((finding) => `<pre><b>${finding.line}</b>${escapeHtml(finding.snippet)}</pre>`).join("")}${rest ? `<div class="more-instances">… and ${rest} more in this file</div>` : ""}`;
}

function listCard(group: FindingGroup) {
  const tier = tierFor(group.weight);
  const tally = group.count > 1 ? ` ×${group.count}` : "";
  return `<article class="finding" data-tier="${tier}"><div class="finding-body"><div class="finding-head"><span><i class="tier-chip">${tier}</i> ${escapeHtml(group.path)}</span><b>${escapeHtml(group.displayName)}${tally} · weight ${group.weight.toFixed(2)}</b></div>${instanceRows(group)}<div class="finding-why"><strong>WHY THIS COUNTS</strong>${escapeHtml(group.why)}</div><p>${escapeHtml(group.findings[0].roast)}</p></div></article>`;
}

function deckCard(group: FindingGroup, index: number, total: number) {
  const tier = tierFor(group.weight);
  const tally = group.count > 1 ? `<span class="card-count">×${group.count}</span>` : "";
  const first = group.findings[0];
  return `<article class="card" data-tier="${tier}" role="group" aria-label="${escapeHtml(group.displayName)}, ${group.count} in ${escapeHtml(group.path)}" style="--i:${index};z-index:${total - index}">
    <div class="card-body">
      <div class="card-head"><span class="tier-chip">${tier}</span><span class="card-weight">WEIGHT ${group.weight.toFixed(2)}</span></div>
      <h3 class="card-rule">${escapeHtml(group.displayName)}${tally}</h3>
      <div class="card-loc">${escapeHtml(group.path)}</div>
      <pre class="card-snippet">${escapeHtml(first.snippet)}</pre>
      <div class="card-why"><strong>WHY THIS COUNTS</strong>${escapeHtml(group.why)}</div>
      <p class="card-roast">${escapeHtml(first.roast)}</p>
      <div class="stamp guilty">GUILTY</div><div class="stamp dispute">DISPUTED</div>
    </div>
  </article>`;
}

/**
 * Taking the deck straight off the top of the list gave ten cards of whichever
 * idiom the codebase repeats most - one repository opened with ten consecutive
 * `.catch(() => {})`. Rotating between rules costs nothing and makes the deck
 * describe the repository rather than its loudest habit.
 */
function sampleGroups(groups: readonly FindingGroup[], limit: number): FindingGroup[] {
  const byRule = new Map<string, FindingGroup[]>();
  for (const group of groups) {
    const queue = byRule.get(group.ruleId);
    if (queue) queue.push(group); else byRule.set(group.ruleId, [group]);
  }
  const queues = [...byRule.values()];
  const picked: FindingGroup[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      picked.push(queue[round]);
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
  }
  return picked;
}

function buildDeck(groups: readonly FindingGroup[]) {
  deck = sampleGroups(groups, DECK_SIZE);
  deckOverflow = groups.reduce((sum, group) => sum + group.count, 0) - deck.reduce((sum, group) => sum + group.count, 0);
  cursor = 0;
  verdicts = [];
  deckEl.innerHTML = deck.length ? deck.map((group, index) => deckCard(group, index, deck.length)).join("") : `<div class="deck-empty">Nothing to judge. Suspiciously clean.</div>`;
  $("#deck-verdict").classList.add("hidden");
  // With no findings the deck has nothing to say, so the list is the only honest view.
  $(".view-toggle").classList.toggle("hidden", !deck.length);
  if (!deck.length) setView("list"); else setView("deck");
  updateStack();
}

function cards() { return [...deckEl.querySelectorAll<HTMLElement>(".card")]; }

function updateStack() {
  cards().forEach((card, index) => {
    const depth = index - cursor;
    if (depth < 0) return;
    card.classList.remove("leaving", "dragging");
    card.style.transform = "";
    card.style.setProperty("--i", String(depth));
    card.dataset.depth = depth > 2 ? "hidden" : String(depth);
    card.setAttribute("aria-hidden", depth === 0 ? "false" : "true");
    setStamps(card, 0);
  });
  ($("#deck-undo") as HTMLButtonElement).disabled = cursor === 0;
  ($("#plead-guilty") as HTMLButtonElement).disabled = cursor >= deck.length;
  ($("#plead-dispute") as HTMLButtonElement).disabled = cursor >= deck.length;
  $("#deck-progress").textContent = deck.length ? `${Math.min(cursor + 1, deck.length)} / ${deck.length}` : "";
  if (cursor >= deck.length && deck.length) showVerdict();
}

function setStamps(card: HTMLElement, dx: number) {
  const strength = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
  card.querySelector<HTMLElement>(".stamp.guilty")!.style.opacity = dx < 0 ? String(strength) : "0";
  card.querySelector<HTMLElement>(".stamp.dispute")!.style.opacity = dx > 0 ? String(strength) : "0";
}

function decide(verdict: Verdict) {
  if (cursor >= deck.length) return;
  const card = cards()[cursor];
  const away = verdict === "guilty" ? -1 : 1;
  card.classList.add("leaving");
  card.style.transform = `translateX(${away * 145}%) rotate(${away * 20}deg)`;
  card.setAttribute("aria-hidden", "true");
  verdicts.push(verdict);
  cursor += 1;
  updateStack();
  drawCard();
}

function undo() {
  if (!cursor) return;
  cursor -= 1;
  verdicts.pop();
  $("#deck-verdict").classList.add("hidden");
  updateStack();
  drawCard();
}

/** `#` for Python, `//` everywhere else the scanner accepts. */
function directive(finding: Finding) { return `${finding.path.toLowerCase().endsWith(".py") ? "#" : "//"} slop-disable-next-line ${finding.ruleId}`; }

function disputedSnippet() {
  return deck
    .filter((_, index) => verdicts[index] === "dispute")
    .flatMap((group) => group.findings.map((finding) => `${finding.path}:${finding.line}\n  ${directive(finding)}`))
    .join("\n\n");
}

function showVerdict() {
  const instances = (verdict: Verdict) => deck.reduce((sum, group, index) => sum + (verdicts[index] === verdict ? group.count : 0), 0);
  const owned = instances("guilty");
  const disputed = instances("dispute");
  const snippet = disputedSnippet();
  const panel = $("#deck-verdict");
  panel.innerHTML = `<div class="verdict-body">
    <h3>Verdict in.</h3>
    <p>You judged ${deck.length} group${deck.length === 1 ? "" : "s"} covering ${owned + disputed} finding${owned + disputed === 1 ? "" : "s"}.${deckOverflow > 0 ? ` ${deckOverflow} more ${deckOverflow === 1 ? "is" : "are"} waiting in the list view.` : ""}</p>
    <div class="tally">
      <div class="owned"><span>OWNED</span><strong>${owned}</strong></div>
      <div class="clean"><span>DISPUTED</span><strong>${disputed}</strong></div>
    </div>
    ${disputed ? `<h4>PASTE THESE WHERE YOU DISAGREED</h4><pre id="dispute-snippet">${escapeHtml(snippet)}</pre>
    <div class="verdict-actions"><button id="copy-directives" class="primary">Copy directives</button><button id="deck-replay">Judge again</button></div>`
      : `<div class="verdict-actions"><button id="deck-replay">Judge again</button></div>`}
  </div>`;
  panel.classList.remove("hidden");
  panel.querySelector("#deck-replay")!.addEventListener("click", () => { cursor = 0; verdicts = []; panel.classList.add("hidden"); updateStack(); drawCard(); });
  panel.querySelector("#copy-directives")?.addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(snippet);
    (event.currentTarget as HTMLElement).textContent = "Copied";
  });
}

let drag: { pointerId: number; startX: number; startY: number; card: HTMLElement } | undefined;
deckEl.addEventListener("pointerdown", (event) => {
  const card = cards()[cursor];
  if (!card || !card.contains(event.target as Node) || drag) return;
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, card };
  card.classList.add("dragging");
  card.setPointerCapture(event.pointerId);
});
deckEl.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  drag.card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 17}deg)`;
  setStamps(drag.card, dx);
});
function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const { card } = drag;
  drag = undefined;
  card.classList.remove("dragging");
  if (Math.abs(dx) >= SWIPE_THRESHOLD) decide(dx < 0 ? "guilty" : "dispute");
  else { card.style.transform = ""; setStamps(card, 0); }
}
deckEl.addEventListener("pointerup", endDrag);
deckEl.addEventListener("pointercancel", endDrag);

deckEl.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "arrowleft") decide("guilty");
  else if (key === "arrowright") decide("dispute");
  else if (key === "z") undo();
  else return;
  event.preventDefault();
});
$("#plead-guilty").addEventListener("click", () => decide("guilty"));
$("#plead-dispute").addEventListener("click", () => decide("dispute"));
$("#deck-undo").addEventListener("click", undo);

function setView(view: string) {
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tab")) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  }
  $("#deck-view").classList.toggle("hidden", view !== "deck");
  $("#findings").classList.toggle("hidden", view === "deck");
}
for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tab")) tab.addEventListener("click", () => setView(tab.dataset.view ?? "deck"));

$("#scan-button").addEventListener("click", async () => {
  const status = $("#status");
  const button = $("#scan-button") as HTMLButtonElement;
  const progressPanel = $("#scan-progress");
  const setProgress = (phase: string, detail: string) => { $("#scan-phase").textContent = phase; $("#scan-progress-detail").textContent = detail; status.textContent = detail; };
  current = undefined;
  $("#results").classList.add("hidden");
  progressPanel.classList.remove("hidden", "scan-error");
  $("#scan-kicker").textContent = "ANALYSIS IN PROGRESS";
  setProgress("Preparing source files…", "No score is calculated until the scan is complete.");
  button.disabled = true;
  button.innerHTML = "SCANNING <b>···</b>";
  progressPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    let result: AnalysisResult;
    if (mode === "diff") { setProgress("Analyzing changed lines…", "The rules are running in your browser. No score exists yet."); result = await analyze({ diff: ($("#diff-input") as HTMLTextAreaElement).value }); }
    else if (mode === "files") { if (!droppedFiles.length) throw new Error("Choose at least one source file."); setProgress(`Analyzing ${droppedFiles.length} source files…`, "The rules are running in your browser. No score exists yet."); result = await analyze({ files: droppedFiles }); }
    else {
      setProgress("Reading the repository…", "Listing source files from GitHub.");
      const fetched = await githubFiles(($("#github-input") as HTMLInputElement).value, (message) => setProgress("Fetching source files…", message));
      const count = fetched.files?.length ?? 1;
      setProgress(`Analyzing ${count} source file${count === 1 ? "" : "s"}…`, `${fetched.skipped} file${fetched.skipped === 1 ? " was" : "s were"} skipped or unavailable.${fetched.note ? ` ${fetched.note}` : ""} No score exists yet.`);
      result = await analyze({ diff: fetched.diff, files: fetched.files, skippedFiles: fetched.skipped, completeRepository: fetched.complete, knownPaths: fetched.knownPaths });
    }
    progressPanel.classList.add("hidden");
    await render(result);
    status.textContent = `Complete · ${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} with file and line receipts.`;
  } catch (error) {
    progressPanel.classList.add("scan-error");
    $("#scan-kicker").textContent = "SCAN FAILED";
    setProgress("No score was produced.", `${(error as Error).message} You can retry without reloading the page.`);
  } finally {
    button.disabled = false;
    button.innerHTML = "RUN THE RECEIPTS <b>↵</b>";
  }
});
$("#confession").addEventListener("change", drawCard);
$("#download-card").addEventListener("click", () => { const anchor = document.createElement("a"); anchor.download = `slop-check-${current?.grade ?? "grade"}.png`; anchor.href = ($("#share-card") as HTMLCanvasElement).toDataURL("image/png"); anchor.click(); });
async function copyCard() { const blob = await new Promise<Blob | null>((resolve) => ($("#share-card") as HTMLCanvasElement).toBlob(resolve)); if (!blob) return; await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); $("#copy-card").textContent = "Copied"; }
$("#copy-card").addEventListener("click", copyCard);
$("#post-card").addEventListener("click", async () => { if (!current) return; await copyCard(); const text = `my codebase got a ${current.grade} on slop-check ("${current.label}") — ${location.origin} (paste the card)`; window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer"); });

void hydrateHash();
