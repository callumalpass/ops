import type { RemoteItem } from "../types.js";
import type { FetchItemInput, ProviderAdapter } from "./provider.js";
import { basicAuth, getJson, optionalEnv, requiredEnv, stripHtml } from "./http.js";
import { originUrl, parseAzureRepo } from "./git-remote.js";

interface AzureIdentity {
  displayName?: string;
  uniqueName?: string;
}

interface AzureWorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
  _links?: {
    html?: { href?: string };
  };
}

interface AzurePullRequestResponse {
  pullRequestId: number;
  title: string;
  description?: string;
  status?: string;
  sourceRefName?: string;
  targetRefName?: string;
  creationDate?: string;
  closedDate?: string;
  createdBy?: AzureIdentity;
  reviewers?: AzureIdentity[];
  _links?: {
    web?: { href?: string };
  };
}

interface AzureScope {
  organization: string;
  project: string;
  repository?: string;
}

function parseScope(scope: string): AzureScope {
  const parts = scope.split("/").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 2) {
    return { organization: parts[0], project: parts[1] };
  }
  if (parts.length === 3) {
    return { organization: parts[0], project: parts[1], repository: parts[2] };
  }
  throw new Error(`Invalid Azure scope '${scope}'. Expected 'org/project' or 'org/project/repo'.`);
}

async function detectScopeFromRemote(cwd: string): Promise<AzureScope | undefined> {
  const remote = await originUrl(cwd);
  return parseAzureRepo(remote);
}

async function resolveScope(input: FetchItemInput): Promise<AzureScope> {
  if (input.repo) {
    return parseScope(input.repo);
  }

  const org = optionalEnv("AZURE_ORG");
  const project = optionalEnv("AZURE_PROJECT");
  const repository = optionalEnv("AZURE_REPO");
  if (org && project) {
    return { organization: org, project, repository };
  }

  const fromRemote = await detectScopeFromRemote(input.cwd);
  if (fromRemote) return fromRemote;

  throw new Error("Could not resolve Azure scope. Set --repo or AZURE_ORG/AZURE_PROJECT.");
}

function authHeaders(): Record<string, string> {
  const pat = requiredEnv("AZURE_DEVOPS_PAT");
  return {
    Authorization: basicAuth("", pat),
  };
}

function baseUrl(scope: AzureScope): string {
  return `https://dev.azure.com/${encodeURIComponent(scope.organization)}/${encodeURIComponent(scope.project)}`;
}

function asIdentity(value: unknown): AzureIdentity | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as AzureIdentity;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function splitTags(tags: string): Array<{ name: string }> {
  return tags
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

async function detectRepo(cwd: string): Promise<string> {
  const org = optionalEnv("AZURE_ORG");
  const project = optionalEnv("AZURE_PROJECT");
  const repository = optionalEnv("AZURE_REPO");
  if (org && project && repository) {
    return `${org}/${project}/${repository}`;
  }
  if (org && project) {
    return `${org}/${project}`;
  }

  const fromRemote = await detectScopeFromRemote(cwd);
  if (!fromRemote) {
    throw new Error("Could not detect Azure scope from git remote. Set --repo or AZURE_ORG/AZURE_PROJECT.");
  }
  return fromRemote.repository
    ? `${fromRemote.organization}/${fromRemote.project}/${fromRemote.repository}`
    : `${fromRemote.organization}/${fromRemote.project}`;
}

export async function fetchAzureItem(input: FetchItemInput): Promise<RemoteItem> {
  const scope = await resolveScope(input);
  const base = baseUrl(scope);
  const headers = authHeaders();

  if (input.kind === "issue") {
    const workItem = await getJson<AzureWorkItemResponse>(
      `${base}/_apis/wit/workitems/${input.number}?api-version=7.1`,
      headers,
    );
    const fields = workItem.fields ?? {};
    const title = asString(fields["System.Title"]);
    const state = asString(fields["System.State"]);
    const descriptionRaw = asString(fields["System.Description"]);
    const author = asIdentity(fields["System.CreatedBy"]);
    const assignee = asIdentity(fields["System.AssignedTo"]);
    const tags = asString(fields["System.Tags"]);
    const updatedAt = asString(fields["System.ChangedDate"]) || new Date().toISOString();

    return {
      provider: "azure",
      kind: "issue",
      repo: `${scope.organization}/${scope.project}`,
      number: workItem.id,
      title,
      body: stripHtml(descriptionRaw),
      author: author?.uniqueName ?? author?.displayName ?? "",
      state,
      url: workItem._links?.html?.href ?? `${base}/_workitems/edit/${workItem.id}`,
      labels: tags ? splitTags(tags) : [],
      assignees: assignee ? [{ login: assignee.uniqueName ?? assignee.displayName ?? "" }].filter((x) => x.login) : [],
      updatedAt,
    };
  }

  if (!scope.repository) {
    throw new Error("Azure PR lookup requires repository scope: --repo org/project/repo or AZURE_REPO.");
  }

  const pr = await getJson<AzurePullRequestResponse>(
    `${base}/_apis/git/repositories/${encodeURIComponent(scope.repository)}/pullRequests/${input.number}?api-version=7.1`,
    headers,
  );

  return {
    provider: "azure",
    kind: "pr",
    repo: `${scope.organization}/${scope.project}/${scope.repository}`,
    number: pr.pullRequestId,
    title: pr.title,
    body: pr.description ?? "",
    author: pr.createdBy?.uniqueName ?? pr.createdBy?.displayName ?? "",
    state: pr.status ?? "",
    url: pr._links?.web?.href ?? `${base}/_git/${encodeURIComponent(scope.repository)}/pullrequest/${pr.pullRequestId}`,
    labels: [],
    assignees: (pr.reviewers ?? [])
      .map((x) => ({ login: x.uniqueName ?? x.displayName ?? "" }))
      .filter((x) => x.login),
    updatedAt: pr.closedDate ?? pr.creationDate ?? new Date().toISOString(),
    headRefName: pr.sourceRefName?.replace(/^refs\/heads\//, ""),
    baseRefName: pr.targetRefName?.replace(/^refs\/heads\//, ""),
  };
}

function itemRef(item: RemoteItem): string {
  if (item.kind === "issue") {
    return `${item.repo}#${item.number}`;
  }
  return `${item.repo}#PR${item.number}`;
}

export const azureProvider: ProviderAdapter = {
  id: "azure",
  detectRepo,
  fetchItem: fetchAzureItem,
  itemRef,
};
