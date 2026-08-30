/**
 * One definition of what a repository contains, shared by the CLI walker and the
 * browser's GitHub loader. They used to keep separate copies of these patterns and
 * had already drifted apart, so the same repository could score differently
 * depending on which one you asked.
 */
export function isSupported(path) {
    return /\.(?:[cm]?[jt]sx?|py)$/i.test(path);
}
export function isTypeScript(path) {
    return /\.(?:ts|tsx|mts|cts)$/i.test(path);
}
/** Build output, dependencies, and anything the repository did not write by hand. */
export function isIgnoredDirectory(path) {
    return /(?:^|\/)(?:node_modules|dist|build|out|vendor|vendored|coverage|web-dist|__pycache__|\.[^/]+)\//.test(path);
}
export function isGeneratedFile(path) {
    return /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.min\.[^.]+$|\.generated\./i.test(path);
}
/**
 * Test code is written against different rules than production code: fixtures use
 * documentation URLs, assertions deliberately let failures throw, and a stub with
 * no error handling is the point rather than an oversight. Scoring it alongside
 * production code was the single largest source of false findings - it inflated
 * every repository that takes testing seriously, which is exactly backwards.
 */
export function isTestPath(path) {
    return /(?:^|\/)(?:tests?|__tests__|__mocks__|spec|specs|e2e|fixtures?|testdata|benchmarks?)\//i.test(path)
        || /(?:^|\/)conftest\.py$/i.test(path)
        || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path)
        || /(?:^|\/)test_[^/]*\.py$/i.test(path)
        || /_test\.py$/i.test(path);
}
/**
 * Examples, samples, and docs are written to be read, not run. They hardcode the
 * URLs they are demonstrating, skip the error handling that would bury the point,
 * and repeat each other by design. Scoring them is the same mistake as scoring
 * tests: it penalises a project for documenting itself, and on a well-documented
 * SDK it was a quarter of every finding.
 */
export function isIllustrativePath(path) {
    return /(?:^|\/)(?:examples?|samples?|docs?|demos?|cookbook|snippets)\//i.test(path);
}
/** True when a path should be read and scored at all. */
export function isScannable(path) {
    return isSupported(path) && !isIgnoredDirectory(path) && !isGeneratedFile(path) && !isTestPath(path) && !isIllustrativePath(path);
}
//# sourceMappingURL=paths.js.map