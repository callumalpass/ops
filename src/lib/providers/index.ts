import type { ProviderId, RemoteItem, RemoteKind } from "../types.js";
import { githubProvider } from "./github.js";
import { gitlabProvider } from "./gitlab.js";
import { jiraProvider } from "./jira.js";
import { azureProvider } from "./azure.js";
import type { ProviderAdapter } from "./provider.js";

const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  github: githubProvider,
  gitlab: gitlabProvider,
  jira: jiraProvider,
  azure: azureProvider,
};

export function getProvider(provider: ProviderId = "github"): ProviderAdapter {
  const selected = PROVIDERS[provider];
  if (!selected) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return selected;
}

export async function detectProviderRepo(cwd: string, provider: ProviderId = "github"): Promise<string> {
  return getProvider(provider).detectRepo(cwd);
}

export async function fetchProviderItem(
  kind: RemoteKind,
  number: number,
  cwd: string,
  repo?: string,
  provider: ProviderId = "github",
): Promise<RemoteItem> {
  const item = await getProvider(provider).fetchItem({ kind, number, cwd, repo });
  return {
    ...item,
    key: item.key || String(number),
  };
}

export function providerItemRef(item: RemoteItem): string {
  if (item.provider === "local" || item.kind === "task") {
    return item.sourcePath ?? item.key ?? item.title;
  }
  return getProvider(item.provider ?? "github").itemRef(item);
}
