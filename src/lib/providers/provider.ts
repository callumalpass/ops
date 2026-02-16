import type { ItemKind, ProviderId, RemoteItem } from "../types.js";

export interface FetchItemInput {
  kind: ItemKind;
  number: number;
  cwd: string;
  repo?: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  detectRepo(cwd: string): Promise<string>;
  fetchItem(input: FetchItemInput): Promise<RemoteItem>;
  itemRef(item: RemoteItem): string;
}
