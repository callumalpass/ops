import type { ProviderId, RemoteItem, RemoteKind } from "../types.js";

export interface FetchItemInput {
  kind: RemoteKind;
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
