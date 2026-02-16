import type { Collection } from "@callumalpass/mdbase";
import path from "node:path";
import { fetchProviderItem, providerItemRef } from "./providers/index.js";
import { readItem, upsertItemFromProvider } from "./ops-data.js";
import type { ItemKind, ProviderId, RemoteItem } from "./types.js";

export interface BuildContextInput {
  collection: Collection;
  repoRoot: string;
  kind?: ItemKind;
  number?: number;
  repo?: string;
  provider?: ProviderId;
  explicitVars?: Record<string, unknown>;
  ensureSidecar: boolean;
}

export interface BuildContextResult {
  context: Record<string, unknown>;
  item?: RemoteItem;
  sidecar?: {
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  };
}

async function tryReadSidecar(
  collection: Collection,
  kind: ItemKind,
  number: number,
): Promise<{ path: string; frontmatter: Record<string, unknown>; body: string } | undefined> {
  try {
    return await readItem(collection, kind, number);
  } catch {
    return undefined;
  }
}

export async function buildContext(input: BuildContextInput): Promise<BuildContextResult> {
  const explicitVars = input.explicitVars ?? {};
  const context: Record<string, unknown> = {
    repo_root: input.repoRoot,
    ops_root: path.join(input.repoRoot, ".ops"),
  };

  let item: RemoteItem | undefined;
  let sidecar: BuildContextResult["sidecar"] | undefined;

  if (input.kind && typeof input.number === "number") {
    item = await fetchProviderItem(input.kind, input.number, input.repoRoot, input.repo, input.provider ?? "github");
    if (input.ensureSidecar) {
      await upsertItemFromProvider(input.collection, item);
    }
    sidecar = await tryReadSidecar(input.collection, input.kind, input.number);

    const labels = item.labels.map((x) => x.name);
    const assignees = item.assignees.map((x) => x.login);
    const provider = item.provider ?? "github";

    // Fence body to mitigate prompt injection from user-authored content.
    const fencedBody = item.body
      ? `<${provider}-${item.kind}-body>\n${item.body}\n</${provider}-${item.kind}-body>`
      : "";

    Object.assign(context, {
      provider,
      kind: item.kind,
      number: item.number,
      repo: item.repo,
      title: item.title,
      body: fencedBody,
      body_raw: item.body,
      author: item.author,
      state: item.state,
      url: item.url,
      labels,
      labels_csv: labels.join(","),
      assignees,
      assignees_csv: assignees.join(","),
      item_ref: providerItemRef(item),
      head_ref: item.headRefName,
      base_ref: item.baseRefName,
    });

    const providerContext = {
      provider,
      kind: item.kind,
      number: item.number,
      repo: item.repo,
      title: item.title,
      body: fencedBody,
      body_raw: item.body,
      author: item.author,
      state: item.state,
      url: item.url,
      labels,
      labels_csv: labels.join(","),
      assignees,
      assignees_csv: assignees.join(","),
      item_ref: providerItemRef(item),
      head_ref: item.headRefName,
      base_ref: item.baseRefName,
    };
    context[provider] = providerContext;
    context.item = providerContext;

    // Backwards-compatible alias for existing command templates.
    if (provider === "github") {
      context.github = providerContext;
    }
  }

  if (sidecar) {
    context.sidecar = sidecar.frontmatter;
    context.sidecar_path = sidecar.path;
    context.ops_item_path = sidecar.path;
    context.ops_item_abs_path = path.join(input.repoRoot, ".ops", sidecar.path);
    context.sidecar_body = sidecar.body;
    for (const [k, v] of Object.entries(sidecar.frontmatter)) {
      if (!(k in context)) {
        context[k] = v;
      }
    }
  }

  // Explicit vars always override derived values.
  for (const [k, v] of Object.entries(explicitVars)) {
    context[k] = v;
  }

  if (typeof context.repo === "string" && typeof context.number === "number") {
    const kind = typeof context.kind === "string" ? context.kind : "issue";
    if (!context.item_ref) {
      context.item_ref = kind === "pr" ? `${context.repo}#PR${context.number}` : `${context.repo}#${context.number}`;
    }
  }

  context.now_iso = new Date().toISOString();

  return { context, item, sidecar };
}
