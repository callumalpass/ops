import type { Collection } from "@callumalpass/mdbase";
import path from "node:path";
import { fetchLocalTaskItem } from "./local-tasks.js";
import { fetchProviderItem, providerItemRef } from "./providers/index.js";
import { readItem, upsertItemFromProvider } from "./ops-data.js";
import type { ItemTarget } from "./targets.js";
import type { ProviderId, RemoteItem } from "./types.js";

export interface BuildContextInput {
  collection: Collection;
  repoRoot: string;
  target?: ItemTarget;
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
  target: ItemTarget,
): Promise<{ path: string; frontmatter: Record<string, unknown>; body: string } | undefined> {
  try {
    return await readItem(collection, target);
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

  if (input.target) {
    if (input.target.kind === "task") {
      item = await fetchLocalTaskItem(input.collection, input.target.key);
    } else if (typeof input.target.number === "number") {
      item = await fetchProviderItem(
        input.target.kind,
        input.target.number,
        input.repoRoot,
        input.repo,
        input.provider ?? "github",
      );
    } else {
      throw new Error(`Target '${input.target.kind}' requires a numeric number.`);
    }

    if (input.ensureSidecar) {
      await upsertItemFromProvider(input.collection, item);
    }
    sidecar = await tryReadSidecar(input.collection, {
      kind: item.kind,
      key: item.key ?? input.target.key,
      number: item.number,
    });

    const labels = item.labels.map((x) => x.name);
    const assignees = item.assignees.map((x) => x.login);
    const provider = item.provider ?? "local";
    const itemRef = providerItemRef(item);

    // Fence body to mitigate prompt injection from user-authored content.
    const fencedBody = item.body
      ? `<${provider}-${item.kind}-body>\n${item.body}\n</${provider}-${item.kind}-body>`
      : "";

    Object.assign(context, {
      provider,
      kind: item.kind,
      number: item.number,
      key: item.key,
      repo: item.repo,
      title: item.title,
      body: fencedBody,
      body_raw: item.body,
      author: item.author,
      state: item.state,
      url: item.url,
      source_path: item.sourcePath,
      labels,
      labels_csv: labels.join(","),
      assignees,
      assignees_csv: assignees.join(","),
      item_ref: itemRef,
      head_ref: item.headRefName,
      base_ref: item.baseRefName,
    });

    const providerContext = {
      provider,
      kind: item.kind,
      number: item.number,
      key: item.key,
      repo: item.repo,
      title: item.title,
      body: fencedBody,
      body_raw: item.body,
      author: item.author,
      state: item.state,
      url: item.url,
      source_path: item.sourcePath,
      labels,
      labels_csv: labels.join(","),
      assignees,
      assignees_csv: assignees.join(","),
      item_ref: itemRef,
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

  if (!context.item_ref) {
    if (typeof context.repo === "string" && typeof context.number === "number") {
      const kind = typeof context.kind === "string" ? context.kind : "issue";
      context.item_ref = kind === "pr" ? `${context.repo}#PR${context.number}` : `${context.repo}#${context.number}`;
    } else if (typeof context.source_path === "string") {
      context.item_ref = context.source_path;
    } else if (typeof context.key === "string") {
      context.item_ref = context.key;
    }
  }

  context.now_iso = new Date().toISOString();

  return { context, item, sidecar };
}
