import { existsSync } from "node:fs";
import path from "node:path";

export const OPS_DIR = ".ops";

export function findRepoRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
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

export function itemPath(kind: "issue" | "pr", number: number): string {
  return `items/${kind}-${number}.md`;
}

export function handoffPath(id: string): string {
  return `handoffs/${id}.md`;
}

export function commandPath(id: string): string {
  return `commands/${id}.md`;
}
