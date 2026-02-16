import type { RemoteItem } from "../types.js";
import type { FetchItemInput, ProviderAdapter } from "./provider.js";
import { basicAuth, getJson, optionalEnv, requiredEnv, withDefaultBaseUrl } from "./http.js";

interface JiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

interface JiraDescriptionNode {
  type?: string;
  text?: string;
  content?: JiraDescriptionNode[];
}

interface JiraIssueResponse {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: JiraDescriptionNode;
    status?: { name?: string };
    assignee?: JiraUser;
    reporter?: JiraUser;
    labels?: string[];
    updated?: string;
    project?: { key?: string };
  };
}

function jiraDescriptionToText(node: JiraDescriptionNode | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content) || node.content.length === 0) return "";
  const separator = node.type === "paragraph" || node.type === "listItem" ? "\n" : "";
  return node.content.map((child) => jiraDescriptionToText(child)).filter(Boolean).join(separator).trim();
}

function baseUrl(): string {
  return withDefaultBaseUrl(optionalEnv("JIRA_BASE_URL"), "");
}

function authHeaders(): Record<string, string> {
  const user = optionalEnv("JIRA_EMAIL") ?? optionalEnv("JIRA_USER");
  if (!user) {
    throw new Error("Missing JIRA_EMAIL or JIRA_USER.");
  }
  const token = requiredEnv("JIRA_API_TOKEN");
  return {
    Authorization: basicAuth(user, token),
  };
}

function resolveProjectKey(repo?: string): string | undefined {
  if (repo && repo.trim().length > 0) return repo.trim();
  return optionalEnv("JIRA_PROJECT");
}

function resolveIssueIdOrKey(number: number, repo?: string): string {
  const project = resolveProjectKey(repo);
  return project ? `${project}-${number}` : String(number);
}

async function detectRepo(_cwd: string): Promise<string> {
  return resolveProjectKey() ?? "jira";
}

export async function fetchJiraItem(input: FetchItemInput): Promise<RemoteItem> {
  if (input.kind !== "issue") {
    throw new Error("Jira provider currently supports issues only.");
  }

  const base = baseUrl();
  if (!base) {
    throw new Error("Missing JIRA_BASE_URL.");
  }

  const issueIdOrKey = resolveIssueIdOrKey(input.number, input.repo);
  const issue = await getJson<JiraIssueResponse>(
    `${base}/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}?fields=summary,description,status,assignee,reporter,labels,updated,project`,
    authHeaders(),
  );

  const projectKey = issue.fields.project?.key ?? resolveProjectKey(input.repo) ?? "jira";
  const description = jiraDescriptionToText(issue.fields.description);
  const reporter = issue.fields.reporter;
  const assignee = issue.fields.assignee;
  const author = reporter?.displayName ?? reporter?.emailAddress ?? reporter?.accountId ?? "";
  const assigneeLogin = assignee?.displayName ?? assignee?.emailAddress ?? assignee?.accountId ?? "";

  return {
    provider: "jira",
    kind: "issue",
    repo: projectKey,
    number: input.number,
    title: issue.fields.summary ?? issue.key,
    body: description,
    author,
    state: issue.fields.status?.name ?? "",
    url: `${base}/browse/${issue.key}`,
    labels: (issue.fields.labels ?? []).map((name) => ({ name })).filter((x) => x.name),
    assignees: assigneeLogin ? [{ login: assigneeLogin }] : [],
    updatedAt: issue.fields.updated ?? new Date().toISOString(),
  };
}

function itemRef(item: RemoteItem): string {
  return `${item.repo}-${item.number}`;
}

export const jiraProvider: ProviderAdapter = {
  id: "jira",
  detectRepo,
  fetchItem: fetchJiraItem,
  itemRef,
};
