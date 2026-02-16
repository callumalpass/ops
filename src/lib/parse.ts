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

/**
 * Parse an array of "key=value" strings into a record.
 * When {@link coerce} is true (default), values are auto-coerced via
 * {@link parseValue} (numbers, booleans, JSON).  When false, values are
 * kept as literal strings — use this for template variables where coercion
 * is surprising (e.g. `--var summary=123` should stay `"123"`).
 */
export function parseKeyValuePairs(pairs: string[], coerce = true): Record<string, unknown> {
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
    result[key] = coerce ? parseValue(value) : value;
  }
  return result;
}
