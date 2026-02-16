import type { RenderResult } from "./types.js";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)(?:\|([^}]*))?\s*\}\}/g;

function getByPath(ctx: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = ctx;
  for (const p of parts) {
    if (typeof current !== "object" || current === null || !(p in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function extractPlaceholders(text: string): string[] {
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    vars.add(m[1]);
  }
  return [...vars];
}

export function renderTemplate(template: string, context: Record<string, unknown>): RenderResult {
  const missingRequired = new Set<string>();
  const placeholdersUsed = new Set<string>();

  const text = template.replace(PLACEHOLDER_RE, (_full, keyRaw: string, fallbackRaw?: string) => {
    const key = keyRaw.trim();
    placeholdersUsed.add(key);
    const fallback = fallbackRaw?.trim();

    const value = getByPath(context, key);
    if (value === undefined || value === null || value === "") {
      if (fallback !== undefined) return fallback;
      missingRequired.add(key);
      return "";
    }
    return stringifyValue(value);
  });

  return {
    text,
    missingRequired: [...missingRequired],
    placeholdersUsed: [...placeholdersUsed],
  };
}
