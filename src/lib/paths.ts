import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ItemKind } from "./types.js";

export const OPS_DIR = ".ops";

export function findRepoRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      console.error(
        `warn: no .git directory found above ${startDir}, falling back to cwd as repo root`,
      );
      return path.resolve(startDir);
    }
    dir = parent;
  }
}

export function opsRoot(repoRoot: string): string {
  return path.join(repoRoot, OPS_DIR);
}

export function requireOpsPath(repoRoot: string): string {
  const p = opsRoot(repoRoot);
  if (!existsSync(p)) {
    throw new Error(`Missing .ops directory at ${p}. Run 'ops init' first.`);
  }
  return p;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

export function itemPath(kind: ItemKind, key: string): string {
  const trimmed = key.trim();
  if (/^\d+$/.test(trimmed)) {
    return `items/${kind}-${trimmed}.md`;
  }

  const slug = toSlug(trimmed) || "item";
  const hash = createHash("sha1").update(trimmed).digest("hex").slice(0, 8);
  return `items/${kind}-${slug}-${hash}.md`;
}

export function handoffPath(id: string): string {
  return `handoffs/${id}.md`;
}

export function commandPath(id: string): string {
  return `commands/${id}.md`;
}
