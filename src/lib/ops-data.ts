import type { Collection } from "@callumalpass/mdbase";
import { itemPath } from "./paths.js";
import type { CommandRecord, RemoteItem } from "./types.js";

function escapeExpr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function getCommandById(collection: Collection, id: string): Promise<CommandRecord> {
  const where = `id == "${escapeExpr(id)}"`;
  const result = await collection.query({
    types: ["command"],
    where,
    limit: 2,
    include_body: true,
  });

  if (result.error) {
    throw new Error(`Failed to query command '${id}': ${result.error.message}`);
  }

  if (!result.results || result.results.length === 0) {
    throw new Error(`Command '${id}' not found.`);
  }

  if (result.results.length > 1) {
    throw new Error(`Command '${id}' is not unique.`);
  }

  const row = result.results[0];
  return {
    path: row.path,
    body: row.body ?? "",
    frontmatter: row.frontmatter as CommandRecord["frontmatter"],
  };
}

export async function listCommands(collection: Collection): Promise<CommandRecord[]> {
  const result = await collection.query({
    types: ["command"],
    order_by: [{ field: "id", direction: "asc" }],
    include_body: true,
  });
  if (result.error) {
    throw new Error(`Failed to list commands: ${result.error.message}`);
  }
  return (result.results ?? []).map((row) => ({
    path: row.path,
    body: row.body ?? "",
    frontmatter: row.frontmatter as CommandRecord["frontmatter"],
  }));
}

export async function upsertItemFromProvider(collection: Collection, item: RemoteItem): Promise<string> {
  const path = itemPath(item.kind, item.number);
  const provider = item.provider ?? "github";
  const id = `${provider}:${item.repo}:${item.kind}:${item.number}`;

  const remoteFields: Record<string, unknown> = {
    id,
    repo: item.repo,
    kind: item.kind,
    number: item.number,
    remote_state: item.state,
    remote_title: item.title,
    remote_author: item.author,
    remote_url: item.url,
    remote_updated_at: item.updatedAt,
    last_seen_remote_updated_at: item.updatedAt,
  };

  const readResult = await collection.read(path);
  if (readResult.error) {
    const createResult = await collection.create({
      type: "item_state",
      path,
      frontmatter: {
        ...remoteFields,
        local_status: "new",
        sync_state: "clean",
      },
      body: "",
    });
    if (createResult.error) {
      throw new Error(`Failed to create sidecar ${path}: ${createResult.error.message}`);
    }
    return path;
  }

  const updateResult = await collection.update({ path, fields: remoteFields });
  if (updateResult.error) {
    throw new Error(`Failed to update sidecar ${path}: ${updateResult.error.message}`);
  }
  return path;
}

// Backwards-compatible alias while call sites migrate.
export const upsertItemFromGitHub = upsertItemFromProvider;

export async function readItem(collection: Collection, kind: "issue" | "pr", number: number): Promise<{
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}> {
  const path = itemPath(kind, number);
  const result = await collection.read(path);
  if (result.error) {
    throw new Error(`Item ${path} not found. Run 'ops item ensure --${kind} ${number}' first.`);
  }
  return {
    path,
    frontmatter: (result.frontmatter ?? {}) as Record<string, unknown>,
    body: result.body ?? "",
  };
}

export async function updateItemFields(
  collection: Collection,
  kind: "issue" | "pr",
  number: number,
  fields: Record<string, unknown>,
): Promise<string> {
  const path = itemPath(kind, number);
  const result = await collection.update({ path, fields });
  if (result.error) {
    throw new Error(`Failed to update ${path}: ${result.error.message}`);
  }
  return path;
}
