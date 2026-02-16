import type { Collection } from "@callumalpass/mdbase";
import path from "node:path";
import { fetchItem, itemRef } from "./github.js";
import { readItem, upsertItemFromGitHub } from "./ops-data.js";
import type { GitHubItem, ItemKind } from "./types.js";

export interface BuildContextInput {
  collection: Collection;
  repoRoot: string;
  kind?: ItemKind;
  number?: number;
  repo?: string;
  explicitVars?: Record<string, unknown>;
  ensureSidecar: boolean;
}

export interface BuildContextResult {
  context: Record<string, unknown>;
  item?: GitHubItem;
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

  let item: GitHubItem | undefined;
  let sidecar: BuildContextResult["sidecar"] | undefined;

  if (input.kind && typeof input.number === "number") {
    item = await fetchItem(input.kind, input.number, input.repoRoot, input.repo);
    if (input.ensureSidecar) {
      await upsertItemFromGitHub(input.collection, item);
    }
    sidecar = await tryReadSidecar(input.collection, input.kind, input.number);

    const labels = item.labels.map((x) => x.name);
    const assignees = item.assignees.map((x) => x.login);

    Object.assign(context, {
      kind: item.kind,
      number: item.number,
      repo: item.repo,
      title: item.title,
      body: item.body,
      author: item.author,
      state: item.state,
      url: item.url,
      labels,
      labels_csv: labels.join(","),
      assignees,
      assignees_csv: assignees.join(","),
      item_ref: itemRef(item),
      head_ref: item.headRefName,
      base_ref: item.baseRefName,
    });

    context.github = {
      ...context,
    };
  }

  if (sidecar) {
    context.sidecar = sidecar.frontmatter;
    context.sidecar_path = sidecar.path;
    context.ops_item_path = sidecar.path;
    context.ops_item_abs_path = path.join(input.repoRoot, ".ops", sidecar.path);
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
