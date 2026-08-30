import { analyzeFiles } from "../src/engine.js";
import { parseUnifiedDiff } from "../src/diff.js";
import type { SourceFile } from "../src/types.js";

self.addEventListener("message", (event: MessageEvent<{ id: number; diff?: string; files?: SourceFile[]; skippedFiles?: number; completeRepository?: boolean; knownPaths?: string[] }>) => {
  const { id, diff, files = [], skippedFiles = 0, completeRepository = false, knownPaths } = event.data;
  try {
    const parsed = diff === undefined ? undefined : parseUnifiedDiff(diff);
    const result = analyzeFiles(parsed?.files ?? files, { diffContexts: parsed?.contexts, skippedFiles, completeRepository, knownPaths });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
});
