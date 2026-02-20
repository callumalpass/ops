import type { ItemKind } from "./types.js";

export interface ItemTarget {
  kind: ItemKind;
  key: string;
  number?: number;
}

export interface TargetOptions {
  issue?: string;
  pr?: string;
  task?: string;
}

export function parseTargetOptions(opts: TargetOptions, required: true): ItemTarget;
export function parseTargetOptions(opts: TargetOptions, required: false): ItemTarget | undefined;
export function parseTargetOptions(opts: TargetOptions, required: boolean): ItemTarget | undefined {
  const selected = [opts.issue ? "issue" : "", opts.pr ? "pr" : "", opts.task ? "task" : ""]
    .filter(Boolean);
  if (selected.length > 1) {
    throw new Error("Use only one of --issue, --pr, or --task.");
  }

  if (selected.length === 0) {
    if (required) {
      throw new Error("Provide --issue, --pr, or --task.");
    }
    return undefined;
  }

  if (opts.issue) {
    const number = Number.parseInt(opts.issue, 10);
    if (Number.isNaN(number) || number <= 0) {
      throw new Error(`Invalid issue number: ${opts.issue}`);
    }
    return { kind: "issue", key: String(number), number };
  }

  if (opts.pr) {
    const number = Number.parseInt(opts.pr, 10);
    if (Number.isNaN(number) || number <= 0) {
      throw new Error(`Invalid PR number: ${opts.pr}`);
    }
    return { kind: "pr", key: String(number), number };
  }

  const raw = String(opts.task ?? "").trim();
  if (!raw) {
    throw new Error("Task reference cannot be empty.");
  }
  return { kind: "task", key: raw };
}
