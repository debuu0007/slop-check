import type { SourceFile } from "../src/index.js";
import { isScannable, isSupported } from "../src/paths.js";

/**
 * Everything the GitHub tab does is network-bound, so this loader is built around
 * three things: one API round trip instead of two, a bound on in-flight requests,
 * and a content-addressed cache so a blob is only ever pulled over the wire once.
 */

/**
 * Not a GitHub limit, which is the thing it kept being mistaken for. The tree
 * listing is one anonymous API call per scan out of the 60 an IP gets hourly, and
 * it returns the whole repository whatever this is set to; file contents come from
 * jsDelivr, which has no such budget. The only real cost of a bigger sample is
 * requests and time, and analysis is not where the time goes - 1,000 files of
 * TypeScript score in ~115ms, linear in input. 100 left most of a mid-sized
 * repository unread, and a partial sample is worse than a slow one: a rule that
 * argues from absence needs the files to have been looked at.
 */
const MAX_FILES = 600;
const MAX_FILE_BYTES = 1_000_000;
/**
 * A cap rather than a throttle. Measured against jsDelivr, throttling below the
 * file cap only makes cold scans slower - the CDN's origin pull dominates, and the
 * browser multiplexes these onto one HTTP/2 connection anyway. The bound exists so
 * that raising MAX_FILES can never open an unbounded number of requests.
 */
const FETCH_CONCURRENCY = 100;
const BLOB_CACHE = "slop-check-blobs-v1";

export async function fetchWithTimeout(input: string, init: RequestInit = {}, timeout = 12_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

/**
 * In front of the persistent cache, to skip its async round trip within a session.
 * Bounded because a session that scans several large repos would otherwise hold
 * every file it has ever seen; the Cache API behind it is the durable copy anyway.
 */
const MEMORY_CACHE_LIMIT = 800;
const memoryCache = new Map<string, string>();

function memoize(sha: string, text: string): void {
  memoryCache.set(sha, text);
  // Map iterates in insertion order, so the first key is the oldest.
  while (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value!);
}

async function blobCache(): Promise<Cache | undefined> {
  try { return await caches.open(BLOB_CACHE); } catch { return undefined; }
}

/**
 * Blob SHAs are content hashes, so an entry can never go stale: the same SHA is
 * always the same bytes, whichever branch or repository it was reached through.
 * Rescanning a repo, or scanning two repos that share a file, costs no requests.
 */
export async function cachedText(sha: string, load: () => Promise<Response>): Promise<string | undefined> {
  const memoized = memoryCache.get(sha);
  if (memoized !== undefined) return memoized;
  const key = `https://slop-check.invalid/blob/${sha}`;
  const store = await blobCache();
  const hit = await store?.match(key).catch(() => undefined);
  if (hit) {
    const cached = await hit.text();
    memoize(sha, cached);
    return cached;
  }
  const response = await load();
  if (!response.ok) return undefined;
  const text = await response.text();
  memoize(sha, text);
  await store?.put(key, new Response(text)).catch(() => undefined);
  return text;
}

/** Runs `worker` over `items` with at most `limit` in flight, preserving input order. */
export async function pooled<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const position = next;
      next += 1;
      results[position] = await worker(items[position]);
    }
  }));
  return results;
}

interface TreeBlob { type: string; path: string; sha: string; size?: number }

export interface GithubSource {
  files?: SourceFile[];
  diff?: string;
  skipped: number;
  note?: string;
  /** Every source path in the repository, including files past the fetch cap. */
  knownPaths?: string[];
  /** True only when GitHub returned the repository's complete file listing. */
  complete?: boolean;
}

export async function githubFiles(url: string, progress: (message: string) => void): Promise<GithubSource> {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parsed.hostname !== "github.com" || parts.length < 2) throw new Error("Enter a public github.com repository or pull request URL.");
  const [owner, repository] = parts;

  if (parts[2] === "pull" && parts[3]) {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repository}/pulls/${parts[3]}`, { headers: { Accept: "application/vnd.github.v3.diff" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}. The repository may be private or rate-limited.`);
    return { diff: await response.text(), skipped: 0 };
  }

  // "HEAD" resolves to the default branch, which saves a whole round trip to
  // /repos/:owner/:repo just to read default_branch - and spends one instead of two
  // of the 60 anonymous API calls GitHub allows per hour.
  const branch = parts[2] === "tree" && parts[3] ? parts.slice(3).join("/") : "HEAD";
  const treeResponse = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: { Accept: "application/vnd.github+json" } });
  if (!treeResponse.ok) throw new Error(`Could not read the repository tree (${treeResponse.status}). It may be private, missing, or rate-limited.`);
  const tree = await treeResponse.json();

  const blobs = (tree.tree as TreeBlob[]).filter((item) => item.type === "blob");
  // The tree already lists the whole repository, so import resolution can use every
  // source path even though only a capped sample is fetched and graded.
  const knownPaths = blobs.filter((item) => isSupported(item.path)).map((item) => item.path);
  const supported = blobs.filter((item) => isScannable(item.path));
  const candidates = supported.filter((item) => (item.size ?? 0) < MAX_FILE_BYTES).slice(0, MAX_FILES);
  let skipped = supported.length - candidates.length;
  const note = tree.truncated
    ? "GitHub truncated the listing for this repository; the scan covers the files it returned."
    : supported.length > candidates.length
      ? `This repository has ${supported.length} source files; the scan covers the first ${candidates.length}.`
      : undefined;

  let completed = 0;
  let lastPaint = 0;
  const paint = (force = false) => {
    // One synchronous DOM write per completed file costs more than the fetch it reports on.
    const now = Date.now();
    if (!force && now - lastPaint < 100) return;
    lastPaint = now;
    progress(`Fetching ${completed} / ${candidates.length} files · ${skipped} skipped`);
  };
  paint(true);

  const base = `https://cdn.jsdelivr.net/gh/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}@${encodeURIComponent(branch)}`;
  const fetched = await pooled(candidates, FETCH_CONCURRENCY, async (item) => {
    const cdnPath = item.path.split("/").map(encodeURIComponent).join("/");
    try {
      const content = await cachedText(item.sha, () => fetchWithTimeout(`${base}/${cdnPath}`));
      if (content === undefined) { skipped += 1; return undefined; }
      return { path: item.path, content };
    } catch {
      skipped += 1;
      return undefined;
    } finally {
      completed += 1;
      paint();
    }
  });
  paint(true);
  const files = fetched.filter((file): file is SourceFile => Boolean(file));
  // The listing is what has to be exhaustive, not the sample: a rule may argue from
  // absence as long as GitHub returned every path.
  return { files, skipped, note, knownPaths, complete: !tree.truncated };
}
