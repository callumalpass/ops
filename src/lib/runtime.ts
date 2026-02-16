import path from "node:path";
import { findRepoRoot, opsRoot, requireOpsPath } from "./paths.js";

export function resolveRepoRoot(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  return findRepoRoot(process.cwd());
}

export function resolveOpsRoot(repoRoot: string): string {
  return requireOpsPath(repoRoot);
}

export function resolveOpsRootMaybe(repoRoot: string): string {
  return opsRoot(repoRoot);
}
