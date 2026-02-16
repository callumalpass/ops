import type { RemoteItem } from "../types.js";
import type { FetchItemInput, ProviderAdapter } from "./provider.js";
import { getJson, optionalEnv, requiredEnv, withDefaultBaseUrl } from "./http.js";
import { originUrl, parseGitLabRepo } from "./git-remote.js";

interface GitLabIssueResponse {
  iid: number;
  title: string;
  description?: string;
  state: string;
  web_url: string;
  author?: { username?: string };
  labels?: string[];
  assignees?: Array<{ username?: string }>;
  updated_at: string;
}

interface GitLabMergeRequestResponse extends GitLabIssueResponse {
  source_branch?: string;
  target_branch?: string;
}

async function detectRepo(cwd: string): Promise<string> {
  const fromEnv = optionalEnv("GITLAB_PROJECT");
  if (fromEnv) return fromEnv;
  const remote = await originUrl(cwd);
  const parsed = parseGitLabRepo(remote);
  if (!parsed) {
    throw new Error("Could not detect GitLab project from git remote. Set --repo or GITLAB_PROJECT.");
  }
  return parsed;
}

function apiBase(): string {
  return withDefaultBaseUrl(optionalEnv("GITLAB_BASE_URL"), "https://gitlab.com");
}

function authHeaders(): Record<string, string> {
  return {
    "PRIVATE-TOKEN": requiredEnv("GITLAB_TOKEN"),
  };
}

export async function fetchGitLabItem(input: FetchItemInput): Promise<RemoteItem> {
  const repoName = input.repo ?? (await detectRepo(input.cwd));
  const project = encodeURIComponent(repoName);
  const base = apiBase();

  if (input.kind === "issue") {
    const issue = await getJson<GitLabIssueResponse>(
      `${base}/api/v4/projects/${project}/issues/${input.number}`,
      authHeaders(),
    );
    return {
      provider: "gitlab",
      kind: "issue",
      repo: repoName,
      number: issue.iid,
      title: issue.title,
      body: issue.description ?? "",
      author: issue.author?.username ?? "",
      state: issue.state,
      url: issue.web_url,
      labels: (issue.labels ?? []).map((name) => ({ name })).filter((x) => x.name),
      assignees: (issue.assignees ?? []).map((x) => ({ login: x.username ?? "" })).filter((x) => x.login),
      updatedAt: issue.updated_at,
    };
  }

  const mr = await getJson<GitLabMergeRequestResponse>(
    `${base}/api/v4/projects/${project}/merge_requests/${input.number}`,
    authHeaders(),
  );
  return {
    provider: "gitlab",
    kind: "pr",
    repo: repoName,
    number: mr.iid,
    title: mr.title,
    body: mr.description ?? "",
    author: mr.author?.username ?? "",
    state: mr.state,
    url: mr.web_url,
    labels: (mr.labels ?? []).map((name) => ({ name })).filter((x) => x.name),
    assignees: (mr.assignees ?? []).map((x) => ({ login: x.username ?? "" })).filter((x) => x.login),
    updatedAt: mr.updated_at,
    headRefName: mr.source_branch,
    baseRefName: mr.target_branch,
  };
}

function itemRef(item: RemoteItem): string {
  if (item.kind === "issue") {
    return `${item.repo}#${item.number}`;
  }
  return `${item.repo}!${item.number}`;
}

export const gitlabProvider: ProviderAdapter = {
  id: "gitlab",
  detectRepo,
  fetchItem: fetchGitLabItem,
  itemRef,
};
