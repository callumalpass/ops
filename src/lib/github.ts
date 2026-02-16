import type { GitHubItem, ItemKind } from "./types.js";
import { detectProviderRepo, fetchProviderItem, providerItemRef } from "./providers/index.js";

export async function detectRepo(cwd: string): Promise<string> {
  return detectProviderRepo(cwd, "github");
}

export async function fetchItem(kind: ItemKind, number: number, cwd: string, repo?: string): Promise<GitHubItem> {
  const item = await fetchProviderItem(kind, number, cwd, repo, "github");
  return item as GitHubItem;
}

export function itemRef(item: GitHubItem): string {
  return providerItemRef(item);
}
