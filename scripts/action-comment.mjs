import { readFile } from "node:fs/promises";

const marker = "<!-- slop-check-sticky-comment -->";
const report = await readFile(process.argv[2], "utf8");
const body = `${marker}\n## slop-check\n\n\`\`\`text\n${report.trim()}\n\`\`\`\n\n_Updated automatically for the latest commit._`;
const [owner, repo] = process.env.REPOSITORY.split("/");
const base = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
const list = await fetch(`${base}/issues/${process.env.PR_NUMBER}/comments?per_page=100`, { headers });
if (!list.ok) throw new Error(`Could not list PR comments: ${list.status}`);
const existing = (await list.json()).find((comment) => comment.body?.includes(marker));
const endpoint = existing ? `${base}/issues/comments/${existing.id}` : `${base}/issues/${process.env.PR_NUMBER}/comments`;
const response = await fetch(endpoint, { method: existing ? "PATCH" : "POST", headers, body: JSON.stringify({ body }) });
if (!response.ok) throw new Error(`Could not update PR comment: ${response.status}`);
