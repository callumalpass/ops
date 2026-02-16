import { execCapture } from "./process.js";
import type { GitHubItem, ItemKind } from "./types.js";

interface GitHubIssueRaw {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  author?: { login?: string };
  labels?: Array<{ name?: string }>;
  assignees?: Array<{ login?: string }>;
  updatedAt: string;
}

interface GitHubPrRaw extends GitHubIssueRaw {
  headRefName?: string;
  baseRefName?: string;
}

export async function detectRepo(cwd: string): Promise<string> {
  const result = await execCapture("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`gh repo view failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export async function fetchItem(kind: ItemKind, number: number, cwd: string, repo?: string): Promise<GitHubItem> {
  const repoName = repo ?? (await detectRepo(cwd));
  if (kind === "issue") {
    const args = [
      "issue",
      "view",
      String(number),
      "--repo",
      repoName,
      "--json",
      "number,title,body,state,url,author,labels,assignees,updatedAt",
    ];
    const result = await execCapture("gh", args, cwd);
    if (result.exitCode !== 0) {
      throw new Error(`gh issue view failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as GitHubIssueRaw;
    return {
      kind,
      repo: repoName,
      number: parsed.number,
      title: parsed.title,
      body: parsed.body ?? "",
      author: parsed.author?.login ?? "",
      state: parsed.state,
      url: parsed.url,
      labels: (parsed.labels ?? []).map((x) => ({ name: x.name ?? "" })).filter((x) => x.name),
      assignees: (parsed.assignees ?? []).map((x) => ({ login: x.login ?? "" })).filter((x) => x.login),
      updatedAt: parsed.updatedAt,
    };
  }

  const args = [
    "pr",
    "view",
    String(number),
    "--repo",
    repoName,
    "--json",
    "number,title,body,state,url,author,labels,assignees,updatedAt,headRefName,baseRefName",
  ];
  const result = await execCapture("gh", args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`gh pr view failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout) as GitHubPrRaw;
  return {
    kind,
    repo: repoName,
    number: parsed.number,
    title: parsed.title,
    body: parsed.body ?? "",
    author: parsed.author?.login ?? "",
    state: parsed.state,
    url: parsed.url,
    labels: (parsed.labels ?? []).map((x) => ({ name: x.name ?? "" })).filter((x) => x.name),
    assignees: (parsed.assignees ?? []).map((x) => ({ login: x.login ?? "" })).filter((x) => x.login),
    updatedAt: parsed.updatedAt,
    headRefName: parsed.headRefName,
    baseRefName: parsed.baseRefName,
  };
}

export function itemRef(item: GitHubItem): string {
  if (item.kind === "issue") {
    return `${item.repo}#${item.number}`;
  }
  return `${item.repo}#PR${item.number}`;
}
