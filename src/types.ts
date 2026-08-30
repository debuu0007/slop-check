export interface SourceFile {
  path: string;
  content: string;
}

export interface IndexedFunction {
  path: string;
  name: string;
  body: string;
  index: number;
  line: number;
  /** Position in RepoIndex.functions, so lookups never scan the list. */
  position: number;
  shingles: ReadonlySet<string>;
  identifiers: ReadonlySet<string>;
  literalSignature: string;
}

export interface IndexedCall { path: string; index: number; arity: number; keywords: ReadonlySet<string>; declaration: boolean }

export interface RepoIndex {
  functions: readonly IndexedFunction[];
  functionsByPath: ReadonlyMap<string, readonly IndexedFunction[]>;
  shingleOwners: ReadonlyMap<string, readonly number[]>;
  literalCounts: ReadonlyMap<string, number>;
  callsByName: ReadonlyMap<string, readonly IndexedCall[]>;
  addedNormalizedLines: ReadonlySet<string>;
}

export interface DeletedLine {
  line: number;
  text: string;
}

export interface DiffContext {
  changedLines?: ReadonlySet<number>;
  deletedLines?: readonly DeletedLine[];
  repository?: readonly SourceFile[];
  repoIndex?: RepoIndex;
  /**
   * Every source path the project contains, including files this scan did not
   * score - ignored directories, test code, files past the fetch cap. Resolution
   * needs the whole map even when only part of it is being graded.
   */
  knownPaths?: ReadonlySet<string>;
  /**
   * True only when `knownPaths` is exhaustive. Rules that conclude something from
   * a file's absence are unsound without it.
   */
  repositoryComplete?: boolean;
}

export interface Finding {
  ruleId: string;
  displayName: string;
  path: string;
  line: number;
  snippet: string;
  weight: number;
  why: string;
  roast: string;
}

export interface Rule {
  id: string;
  displayName: string;
  weight: number;
  why: string;
  roasts: readonly string[];
  check(path: string, content: string, diff?: DiffContext): Finding[];
}

export interface Grade {
  grade: "A" | "B" | "C" | "D" | "F";
  label: string;
  color: string;
}

export interface FileResult {
  path: string;
  lines: number;
  score: number;
  findings: Finding[];
}

/**
 * One rule's hits in one file, collapsed. Forty instances of the same swallowed
 * promise are one decision made once, not forty receipts, and reading them as
 * forty buries every other finding under a wall of the same snippet.
 */
export interface FindingGroup {
  ruleId: string;
  displayName: string;
  path: string;
  weight: number;
  why: string;
  count: number;
  findings: Finding[];
}

export interface AnalysisResult {
  version: string;
  score: number;
  grade: Grade["grade"];
  label: string;
  filesScanned: number;
  skippedFiles: number;
  baselinedFindings: number;
  suppressedFindings: number;
  linesScanned: number;
  effectiveKloc: number;
  smallSampleFloorApplied: boolean;
  weightedHits: number;
  /** Undamped total, so the effect of repetition damping stays inspectable. */
  rawWeightedHits: number;
  findings: Finding[];
  groups: FindingGroup[];
  files: FileResult[];
  ruleHits: Record<string, number>;
}

export interface AnalyzeOptions {
  diffContexts?: ReadonlyMap<string, DiffContext>;
  /** Set only when the caller enumerated every source path; defaults to false. */
  completeRepository?: boolean;
  /** Every source path in the project, including files not being scored. */
  knownPaths?: readonly string[];
  weights?: Readonly<Record<string, number>>;
  skippedFiles?: number;
}
