import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedText, githubFiles, pooled } from "../web/github.js";

/** Minimal stand-in for the browser Cache API, so the caching path is exercised for real. */
class FakeCache {
  store = new Map<string, string>();
  async match(key: string) { const value = this.store.get(key); return value === undefined ? undefined : new Response(value); }
  async put(key: string, response: Response) { this.store.set(key, await response.text()); }
}
const caches = { open: vi.fn(async () => new FakeCache()) };
const cacheStore = new FakeCache();
caches.open = vi.fn(async () => cacheStore);
vi.stubGlobal("caches", caches);

function tree(entries: object[], truncated = false) {
  return { ok: true, json: async () => ({ truncated, tree: entries }) };
}
const blob = (path: string, sha = path, size = 10) => ({ type: "blob", path, sha, size });

afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("caches", caches); cacheStore.store.clear(); });

describe("pooled", () => {
  it("keeps results in input order regardless of completion order", async () => {
    const delays = [30, 1, 20, 2, 10];
    const result = await pooled(delays, 2, async (delay) => { await new Promise((r) => setTimeout(r, delay)); return delay; });
    expect(result).toEqual(delays);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0, peak = 0;
    await pooled([...Array(20).keys()], 4, async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });

  it("handles an empty list without hanging", async () => {
    expect(await pooled([], 8, async () => 1)).toEqual([]);
  });
});

describe("cachedText", () => {
  it("fetches once, then serves the same blob from cache", async () => {
    const load = vi.fn(async () => new Response("contents"));
    expect(await cachedText("sha-a", load)).toBe("contents");
    expect(await cachedText("sha-a", load)).toBe("contents");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("writes through to the persistent cache so a reload keeps the blobs", async () => {
    await cachedText("sha-persisted", async () => new Response("kept"));
    expect(cacheStore.store.get("https://slop-check.invalid/blob/sha-persisted")).toBe("kept");
  });

  it("does not cache a failed response", async () => {
    const load = vi.fn(async () => new Response("nope", { status: 404 }));
    expect(await cachedText("sha-missing", load)).toBeUndefined();
    expect(await cachedText("sha-missing", load)).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("githubFiles", () => {
  it("reads a repository with a single API call and fetches only source files", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://api.github.com")) {
        return tree([
          blob("src/app.ts"), blob("src/util.py"), blob("README.md"),
          blob("node_modules/left-pad/index.js"), blob("dist/bundle.js"),
          blob("vendor/thing.js"), blob("web/app.min.js"), blob("package-lock.json"),
          { type: "tree", path: "src", sha: "t" },
        ]) as unknown as Response;
      }
      return new Response("source") as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubFiles("https://github.com/owner/repo", () => {});
    const apiCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://api.github.com"));
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0][0]).toContain("/git/trees/HEAD?recursive=1");
    expect(result.files?.map((file) => file.path)).toEqual(["src/app.ts", "src/util.py"]);
    expect(result.skipped).toBe(0);
  });

  it("re-scanning the same repository refetches no blobs", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      (String(url).startsWith("https://api.github.com") ? tree([blob("a.ts"), blob("b.ts")]) : new Response("x")) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await githubFiles("https://github.com/owner/repo", () => {});
    const afterFirst = fetchMock.mock.calls.filter(([url]) => String(url).includes("jsdelivr")).length;
    await githubFiles("https://github.com/owner/repo", () => {});
    const afterSecond = fetchMock.mock.calls.filter(([url]) => String(url).includes("jsdelivr")).length;

    expect(afterFirst).toBe(2);
    expect(afterSecond).toBe(2);
  });

  it("honours an explicit branch and skips oversized files", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      (String(url).startsWith("https://api.github.com") ? tree([blob("small.ts"), blob("huge.ts", "huge", 2_000_000)]) : new Response("x")) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await githubFiles("https://github.com/owner/repo/tree/release-2", () => {});
    expect(String(fetchMock.mock.calls[0][0])).toContain("/git/trees/release-2?recursive=1");
    expect(result.files?.map((file) => file.path)).toEqual(["small.ts"]);
    expect(result.skipped).toBe(1);
  });

  it("reports a truncated listing instead of pretending it was complete", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      (String(url).startsWith("https://api.github.com") ? tree([blob("a.ts")], true) : new Response("x")) as Response));
    const result = await githubFiles("https://github.com/owner/repo", () => {});
    expect(result.note).toMatch(/truncated/i);
  });

  it("fetches a pull request as a diff", async () => {
    const fetchMock = vi.fn(async () => new Response("diff --git a/x b/x") as Response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await githubFiles("https://github.com/owner/repo/pull/42", () => {});
    expect(String(fetchMock.mock.calls[0][0])).toContain("/pulls/42");
    expect(result.diff).toContain("diff --git");
  });

  it("rejects non-GitHub URLs", async () => {
    await expect(githubFiles("https://gitlab.com/owner/repo", () => {})).rejects.toThrow(/github\.com/);
  });
});
