/**
 * One definition of what a repository contains, shared by the CLI walker and the
 * browser's GitHub loader. They used to keep separate copies of these patterns and
 * had already drifted apart, so the same repository could score differently
 * depending on which one you asked.
 */
export declare function isSupported(path: string): boolean;
export declare function isTypeScript(path: string): boolean;
/** Build output, dependencies, and anything the repository did not write by hand. */
export declare function isIgnoredDirectory(path: string): boolean;
export declare function isGeneratedFile(path: string): boolean;
/**
 * Test code is written against different rules than production code: fixtures use
 * documentation URLs, assertions deliberately let failures throw, and a stub with
 * no error handling is the point rather than an oversight. Scoring it alongside
 * production code was the single largest source of false findings - it inflated
 * every repository that takes testing seriously, which is exactly backwards.
 */
export declare function isTestPath(path: string): boolean;
/**
 * Examples, samples, and docs are written to be read, not run. They hardcode the
 * URLs they are demonstrating, skip the error handling that would bury the point,
 * and repeat each other by design. Scoring them is the same mistake as scoring
 * tests: it penalises a project for documenting itself, and on a well-documented
 * SDK it was a quarter of every finding.
 */
export declare function isIllustrativePath(path: string): boolean;
/** True when a path should be read and scored at all. */
export declare function isScannable(path: string): boolean;
