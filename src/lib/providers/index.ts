import type { ProviderId, RemoteItem, ItemKind } from "../types.js";
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
  kind: ItemKind,
  number: number,
  cwd: string,
  repo?: string,
  provider: ProviderId = "github",
): Promise<RemoteItem> {
  return getProvider(provider).fetchItem({ kind, number, cwd, repo });
}

export function providerItemRef(item: RemoteItem): string {
  return getProvider(item.provider ?? "github").itemRef(item);
}
