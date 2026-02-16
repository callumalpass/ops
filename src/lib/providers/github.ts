import { execCapture } from "../process.js";
import type { RemoteItem } from "../types.js";
import type { FetchItemInput, ProviderAdapter } from "./provider.js";

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

async function detectRepo(cwd: string): Promise<string> {
  const result = await execCapture("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`gh repo view failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function fetchItem(input: FetchItemInput): Promise<RemoteItem> {
  const repoName = input.repo ?? (await detectRepo(input.cwd));
  if (input.kind === "issue") {
    const args = [
      "issue",
      "view",
      String(input.number),
      "--repo",
      repoName,
      "--json",
      "number,title,body,state,url,author,labels,assignees,updatedAt",
    ];
    const result = await execCapture("gh", args, input.cwd);
    if (result.exitCode !== 0) {
      throw new Error(`gh issue view failed: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as GitHubIssueRaw;
    return {
      provider: "github",
      kind: input.kind,
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
    String(input.number),
    "--repo",
    repoName,
    "--json",
    "number,title,body,state,url,author,labels,assignees,updatedAt,headRefName,baseRefName",
  ];
  const result = await execCapture("gh", args, input.cwd);
  if (result.exitCode !== 0) {
    throw new Error(`gh pr view failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout) as GitHubPrRaw;
  return {
    provider: "github",
    kind: input.kind,
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

function itemRef(item: RemoteItem): string {
  if (item.kind === "issue") {
    return `${item.repo}#${item.number}`;
  }
  return `${item.repo}#PR${item.number}`;
}

export const githubProvider: ProviderAdapter = {
  id: "github",
  detectRepo,
  fetchItem,
  itemRef,
};
