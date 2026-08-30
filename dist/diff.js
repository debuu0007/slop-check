export function parseUnifiedDiff(input) {
    const fileLines = new Map();
    const changed = new Map();
    const deleted = new Map();
    let path = "";
    let oldLine = 0;
    let newLine = 0;
    let inHunk = false;
    for (const rawLine of input.split(/\r?\n/)) {
        if (rawLine.startsWith("+++ ")) {
            const target = rawLine.slice(4).trim();
            path = target === "/dev/null" ? path : target.replace(/^b\//, "");
            if (!fileLines.has(path))
                fileLines.set(path, new Map());
            if (!changed.has(path))
                changed.set(path, new Set());
            if (!deleted.has(path))
                deleted.set(path, []);
            inHunk = false;
            continue;
        }
        const hunk = rawLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunk) {
            oldLine = Number(hunk[1]);
            newLine = Number(hunk[2]);
            inHunk = true;
            continue;
        }
        if (!inHunk || !path || rawLine.startsWith("\\ No newline"))
            continue;
        if (rawLine.startsWith("+")) {
            fileLines.get(path)?.set(newLine, rawLine.slice(1));
            changed.get(path)?.add(newLine);
            newLine += 1;
        }
        else if (rawLine.startsWith("-")) {
            deleted.get(path)?.push({ line: oldLine, text: rawLine.slice(1) });
            oldLine += 1;
        }
        else {
            fileLines.get(path)?.set(newLine, rawLine.slice(1));
            oldLine += 1;
            newLine += 1;
        }
    }
    const files = [];
    const contexts = new Map();
    for (const [filePath, numbered] of fileLines) {
        const maximum = Math.max(0, ...numbered.keys());
        const lines = Array.from({ length: maximum }, (_, index) => numbered.get(index + 1) ?? "");
        files.push({ path: filePath, content: lines.join("\n") });
        contexts.set(filePath, { changedLines: changed.get(filePath), deletedLines: deleted.get(filePath) });
    }
    return { files, contexts };
}
//# sourceMappingURL=diff.js.map