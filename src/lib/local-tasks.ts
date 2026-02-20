import path from "node:path";
import type { Collection } from "@callumalpass/mdbase";
import type { RemoteItem } from "./types.js";

function escapeExpr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

async function tryReadPath(
  collection: Collection,
  taskPath: string,
): Promise<{ path: string; frontmatter: Record<string, unknown>; body: string } | undefined> {
  const result = await collection.read(taskPath);
  if (result.error) return undefined;
  return {
    path: taskPath,
    frontmatter: (result.frontmatter ?? {}) as Record<string, unknown>,
    body: result.body ?? "",
  };
}

async function resolveTaskPath(
  collection: Collection,
  taskRef: string,
): Promise<{ path: string; frontmatter: Record<string, unknown>; body: string }> {
  const raw = taskRef.trim();
  const candidates = new Set<string>();

  if (raw.includes("/") || raw.endsWith(".md")) {
    candidates.add(raw);
    if (!raw.startsWith("tasks/")) candidates.add(`tasks/${raw}`);
  }

  if (!raw.endsWith(".md")) {
    candidates.add(`${raw}.md`);
    if (!raw.startsWith("tasks/")) candidates.add(`tasks/${raw}.md`);
  }

  for (const candidate of candidates) {
    const found = await tryReadPath(collection, candidate);
    if (found) return found;
  }

  const where = `title == "${escapeExpr(raw)}"`;
  const byTitle = await collection.query({
    types: ["task"],
    where,
    limit: 3,
    include_body: true,
  });
  if (byTitle.error) {
    throw new Error(`Failed to query tasks: ${byTitle.error.message}`);
  }

  const rows = byTitle.results ?? [];
  if (rows.length === 1) {
    const row = rows[0];
    return {
      path: row.path,
      frontmatter: (row.frontmatter ?? {}) as Record<string, unknown>,
      body: row.body ?? "",
    };
  }
  if (rows.length > 1) {
    const options = rows.map((r) => r.path).join(", ");
    throw new Error(`Task title '${raw}' is ambiguous. Matches: ${options}`);
  }

  throw new Error(`Task '${taskRef}' not found. Use a task path (for example tasks/my-task.md) or exact title.`);
}

export async function fetchLocalTaskItem(collection: Collection, taskRef: string): Promise<RemoteItem> {
  const resolved = await resolveTaskPath(collection, taskRef);
  const fm = resolved.frontmatter;
  const title = readString(fm.title) ?? path.basename(resolved.path, ".md");
  const state = readString(fm.status) ?? "open";
  const author = readString(fm.owner) ?? "";
  const tags = readStringList(fm.tags);
  const updatedAt = readString(fm.dateModified) ?? readString(fm.dateCreated) ?? new Date().toISOString();

  return {
    provider: "local",
    kind: "task",
    key: resolved.path,
    sourcePath: resolved.path,
    title,
    body: resolved.body,
    author,
    state,
    url: resolved.path,
    labels: tags.map((name) => ({ name })),
    assignees: author ? [{ login: author }] : [],
    updatedAt,
  };
}

