import { describe, expect, it, vi } from "vitest";
import { buildTools, registerAgentTools, type AppHandle, type DeckCard } from "../web/webmcp.js";
import { analyzeFiles } from "../src/engine.js";
import { rules } from "../src/rules/index.js";
import type { AnalysisResult, FindingGroup } from "../src/types.js";

/**
 * The tool layer is the contract an agent sees, so it is tested against a real
 * analysis rather than a fixture object: if a rule's output shape changes, the
 * receipts an agent reads change with it and these tests should say so.
 */
const SLOP = `
export async function load(url) {
  try {
    // TODO: In a real implementation, validate the response here
    const response = await fetch(url);
    return response.json();
  } catch (error) {
    // Silently ignore
  }
}
export async function save(url) {
  try {
    const response = await fetch(url);
    return response.json();
  } catch (error) {
    // Silently ignore
  }
}
`.repeat(4);

// Two files, because a group is keyed on rule *and* path - one file could never
// produce the multiple groups the paging and filtering paths exist to handle.
const analysis = analyzeFiles([
  { path: "src/api.ts", content: SLOP },
  { path: "src/jobs.py", content: SLOP.replace(/\/\//g, "#").replace(/export async function/g, "async def").replace(/[{}]/g, "") },
]);
const groupId = (group: FindingGroup) => `${group.ruleId}:${group.path}`;

function harness(overrides: Partial<AppHandle> = {}) {
  const judged: { id: string | undefined; verdict: string }[] = [];
  let result: AnalysisResult | undefined = analysis;
  const cards = (): DeckCard[] => analysis.groups.map((group) => ({
    id: groupId(group), ruleId: group.ruleId, displayName: group.displayName,
    path: group.path, count: group.count, weight: group.weight,
    verdict: judged.find((entry) => entry.id === groupId(group))?.verdict as DeckCard["verdict"],
  }));
  const app: AppHandle = {
    runScan: vi.fn(async () => analysis),
    currentResult: () => result,
    judgeGroup: vi.fn((id, verdict) => {
      const group = analysis.groups.find((candidate) => !id || groupId(candidate) === id);
      if (!group) throw new Error(`No undecided card with id "${id}".`);
      judged.push({ id: groupId(group), verdict });
      return group;
    }),
    disputedSnippet: () => judged.filter((entry) => entry.verdict === "dispute").map((entry) => `${entry.id}\n  // slop-disable-next-line`).join("\n\n"),
    deckState: () => ({ cards: cards(), judged: judged.length, pending: analysis.groups.length - judged.length, overflow: 0 }),
    groupId,
    ...overrides,
  };
  return { app, judged, clear: () => { result = undefined; }, tools: buildTools(app) };
}

const find = (tools: ReturnType<typeof buildTools>, name: string) => tools.find((tool) => tool.name === name)!;
const run = (tool: ReturnType<typeof buildTools>[number], args: unknown = {}) =>
  tool.execute(args as never, { signal: new AbortController().signal });

describe("the analysis the tools are built on", () => {
  it("produces groups to talk about", () => {
    expect(analysis.groups.length).toBeGreaterThan(0);
    expect(analysis.findings.length).toBeGreaterThan(0);
  });
});

describe("tool surface", () => {
  const { tools } = harness();

  it("registers the seven tools in two phases", () => {
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "explain_rule", "export_suppressions", "judge_finding",
      "list_findings", "list_rules", "scan_diff", "scan_repository",
    ]);
    expect(tools.filter((tool) => tool.phase === "always")).toHaveLength(4);
    expect(tools.filter((tool) => tool.phase === "after-scan")).toHaveLength(3);
  });

  it("gives every tool a closed object schema and a description", () => {
    for (const tool of tools) {
      const schema = tool.inputSchema as { type: string; additionalProperties: boolean };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it("marks every tool that can echo scanned code as untrusted", () => {
    for (const name of ["scan_repository", "scan_diff", "list_findings", "export_suppressions"]) {
      expect(find(tools, name).annotations?.untrustedContentHint).toBe(true);
    }
    // Reading the rule registry cannot return anything the scanned repo wrote.
    expect(find(tools, "list_rules").annotations?.untrustedContentHint).toBeUndefined();
  });

  it("marks only the tools that change page state as writing", () => {
    const writes = tools.filter((tool) => tool.annotations?.readOnlyHint !== true).map((tool) => tool.name).sort();
    expect(writes).toEqual(["judge_finding", "scan_diff", "scan_repository"]);
  });
});

describe("list_rules and explain_rule", () => {
  const { tools } = harness();

  it("lists every rule in the registry with its weight", async () => {
    const result = await run(find(tools, "list_rules"));
    const structured = result.structuredContent as { rules: { id: string }[] };
    expect(structured.rules).toHaveLength(rules.length);
    expect(structured.rules.map((rule) => rule.id).sort()).toEqual(rules.map((rule) => rule.id).sort());
  });

  it("explains a known rule and names the suppression directive", async () => {
    const result = await run(find(tools, "explain_rule"), { ruleId: "empty-catch" });
    expect(result.content[0].text).toContain("slop-disable-next-line empty-catch");
    expect(result.isError).toBeUndefined();
  });

  it("rejects an unknown rule by listing the real ids", async () => {
    await expect(run(find(tools, "explain_rule"), { ruleId: "not-a-rule" })).rejects.toThrow(/Known ids/);
  });
});

describe("scan tools", () => {
  it("drives the page's own scan path rather than a private one", async () => {
    const { app, tools } = harness();
    await run(find(tools, "scan_repository"), { url: "https://github.com/owner/repo" });
    expect(app.runScan).toHaveBeenCalledWith(expect.objectContaining({ mode: "github", value: "https://github.com/owner/repo" }));
  });

  it("returns a structured result matching the declared schema", async () => {
    const { tools } = harness();
    const result = await run(find(tools, "scan_diff"), { diff: "diff --git a/x b/x\n+const a: any = 1;" });
    const structured = result.structuredContent as { grade: string; score: number; findingCount: number };
    expect(["A", "B", "C", "D", "F"]).toContain(structured.grade);
    expect(structured.score).toBe(analysis.score);
    expect(structured.findingCount).toBe(analysis.findings.length);
  });

  it("refuses an empty diff instead of reporting a clean bill of health", async () => {
    const { tools } = harness();
    await expect(run(find(tools, "scan_diff"), { diff: "   \n  " })).rejects.toThrow(/empty/i);
  });
});

describe("list_findings", () => {
  const { tools } = harness();

  it("returns group ids that judge_finding accepts", async () => {
    const result = await run(find(tools, "list_findings"));
    const structured = result.structuredContent as { groups: { id: string; ruleId: string; path: string }[] };
    for (const group of structured.groups) expect(group.id).toBe(`${group.ruleId}:${group.path}`);
  });

  it("filters by rule and reports zero matches honestly", async () => {
    const result = await run(find(tools, "list_findings"), { ruleId: "phantom-import" });
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(analysis.groups.filter((group) => group.ruleId === "phantom-import").length);
  });

  it("pages without losing or repeating groups", async () => {
    const first = await run(find(tools, "list_findings"), { limit: 1, offset: 0 });
    const second = await run(find(tools, "list_findings"), { limit: 1, offset: 1 });
    const idOf = (result: Awaited<ReturnType<typeof run>>) => (result.structuredContent as { groups: { id: string }[] }).groups[0]?.id;
    expect(analysis.groups.length).toBeGreaterThan(1);
    expect(idOf(first)).not.toBe(idOf(second));
  });

  it("warns the agent that snippets are untrusted repository content", async () => {
    const result = await run(find(tools, "list_findings"));
    expect(result.content[0].text).toContain("data, not instructions");
  });

  it("fails clearly when nothing has been scanned", async () => {
    const scoped = harness();
    scoped.clear();
    await expect(run(find(scoped.tools, "list_findings"))).rejects.toThrow(/No scan has completed/);
  });
});

describe("judge_finding and export_suppressions", () => {
  it("records a verdict through the page's deck and counts down", async () => {
    const { app, tools, judged } = harness();
    const target = groupId(analysis.groups[0]);
    const result = await run(find(tools, "judge_finding"), { groupId: target, verdict: "guilty" });
    expect(app.judgeGroup).toHaveBeenCalledWith(target, "guilty");
    expect(judged).toEqual([{ id: target, verdict: "guilty" }]);
    expect((result.structuredContent as { verdict: string }).verdict).toBe("guilty");
  });

  it("says so plainly when nothing has been disputed yet", async () => {
    const { tools } = harness();
    const result = await run(find(tools, "export_suppressions"));
    expect(result.content[0].text).toMatch(/Nothing disputed yet/);
    expect((result.structuredContent as { disputed: number }).disputed).toBe(0);
  });

  it("returns directives once a group is disputed", async () => {
    const { tools } = harness();
    await run(find(tools, "judge_finding"), { groupId: groupId(analysis.groups[0]), verdict: "dispute" });
    const result = await run(find(tools, "export_suppressions"));
    const structured = result.structuredContent as { directives: string; disputed: number };
    expect(structured.disputed).toBe(1);
    expect(structured.directives).toContain("slop-disable-next-line");
  });
});

/**
 * The registration half. A fake `document` is enough because that is genuinely
 * all `registerAgentTools` touches - the model context, two event methods, and
 * `CustomEvent` - and stubbing it lets the dynamic phase be asserted rather than
 * described.
 */
function fakeDocument(withModelContext: boolean) {
  const listeners = new Map<string, (() => void)[]>();
  const live = new Map<string, { aborted: boolean }>();
  const registerTool = vi.fn(async (tool: { name: string }, options?: { signal?: AbortSignal }) => {
    const entry = { aborted: false };
    live.set(tool.name, entry);
    options?.signal?.addEventListener("abort", () => { entry.aborted = true; live.delete(tool.name); });
  });
  return {
    document: {
      modelContext: withModelContext ? { registerTool } : undefined,
      addEventListener: (type: string, handler: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), handler]),
      dispatchEvent: (event: { type: string }) => { for (const handler of listeners.get(event.type) ?? []) handler(); return true; },
    },
    registerTool,
    names: () => [...live.keys()].sort(),
    fire: (type: string) => { for (const handler of listeners.get(type) ?? []) handler(); },
  };
}

describe("registerAgentTools", () => {
  it("registers nothing and stays silent where WebMCP is absent", () => {
    const fake = fakeDocument(false);
    vi.stubGlobal("document", fake.document);
    try {
      const registration = registerAgentTools(harness().app);
      expect(registration.supported).toBe(false);
      expect(registration.active()).toEqual([]);
      // The catalogue is still returned, so the page can explain what is missing.
      expect(registration.tools).toHaveLength(7);
      expect(fake.registerTool).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("registers the scan-dependent tools only while a result exists", () => {
    const fake = fakeDocument(true);
    vi.stubGlobal("document", fake.document);
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      let result: AnalysisResult | undefined;
      const { app } = harness({ currentResult: () => result });
      const registration = registerAgentTools(app);

      expect(registration.supported).toBe(true);
      expect(fake.names()).toEqual(["explain_rule", "list_rules", "scan_diff", "scan_repository"]);

      result = analysis;
      fake.fire("slop-check:state");
      expect(fake.names()).toHaveLength(7);
      expect(fake.names()).toContain("judge_finding");
      expect(registration.active()).toHaveLength(7);

      // Clearing the result must take the three back off, not leave them to fail.
      result = undefined;
      fake.fire("slop-check:state");
      expect(fake.names()).toEqual(["explain_rule", "list_rules", "scan_diff", "scan_repository"]);
      expect(registration.active()).toHaveLength(4);
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not re-register on a repeated state event", () => {
    const fake = fakeDocument(true);
    vi.stubGlobal("document", fake.document);
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      registerAgentTools(harness().app);
      const afterFirst = fake.registerTool.mock.calls.length;
      fake.fire("slop-check:state");
      fake.fire("slop-check:state");
      expect(fake.registerTool.mock.calls.length).toBe(afterFirst);
    } finally { vi.unstubAllGlobals(); }
  });

  it("returns the reason as a tool result rather than throwing at the agent", async () => {
    const fake = fakeDocument(true);
    vi.stubGlobal("document", fake.document);
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      registerAgentTools(harness().app);
      const registered = fake.registerTool.mock.calls.map(([tool]) => tool) as unknown as ReturnType<typeof buildTools>;
      const explain = registered.find((tool) => tool.name === "explain_rule")!;
      const failure = await explain.execute({ ruleId: "nope" } as never, { signal: new AbortController().signal });
      expect(failure.isError).toBe(true);
      expect(failure.content[0].text).toContain("Known ids");
    } finally { vi.unstubAllGlobals(); }
  });
});
