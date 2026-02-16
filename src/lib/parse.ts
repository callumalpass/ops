export function parseValue(raw: string): unknown {
  const value = raw.trim();

  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  if (/^-?\d+$/.test(value)) {
    const n = Number.parseInt(value, 10);
    if (!Number.isNaN(n)) return n;
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    const n = Number.parseFloat(value);
    if (!Number.isNaN(n)) return n;
  }

  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      return raw;
    }
  }

  return raw;
}

export function parseKeyValuePairs(pairs: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) {
      throw new Error(`Invalid key=value pair: ${pair}`);
    }
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (!key) {
      throw new Error(`Invalid key in pair: ${pair}`);
    }
    result[key] = parseValue(value);
  }
  return result;
}
