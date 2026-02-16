import { describe, it, expect } from "vitest";
import { renderTemplate, extractPlaceholders } from "../lib/template.js";

describe("extractPlaceholders", () => {
  it("extracts simple placeholders", () => {
    expect(extractPlaceholders("Hello {{name}}")).toEqual(["name"]);
  });

  it("extracts multiple placeholders", () => {
    const result = extractPlaceholders("{{a}} and {{b}} and {{c}}");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("deduplicates repeated placeholders", () => {
    expect(extractPlaceholders("{{x}} {{x}}")).toEqual(["x"]);
  });

  it("extracts placeholders with fallback syntax", () => {
    expect(extractPlaceholders("{{name|default}}")).toEqual(["name"]);
  });

  it("extracts dotted path placeholders", () => {
    expect(extractPlaceholders("{{github.title}}")).toEqual(["github.title"]);
  });

  it("returns empty for no placeholders", () => {
    expect(extractPlaceholders("no placeholders here")).toEqual([]);
  });

  it("handles whitespace inside braces", () => {
    expect(extractPlaceholders("{{ name }}")).toEqual(["name"]);
  });
});

describe("renderTemplate", () => {
  it("replaces simple placeholders", () => {
    const result = renderTemplate("Hello {{name}}", { name: "world" });
    expect(result.text).toBe("Hello world");
    expect(result.missingRequired).toEqual([]);
    expect(result.placeholdersUsed).toEqual(["name"]);
  });

  it("uses fallback when value is missing", () => {
    const result = renderTemplate("{{name|anon}}", {});
    expect(result.text).toBe("anon");
    expect(result.missingRequired).toEqual([]);
  });

  it("reports missing required vars (no fallback)", () => {
    const result = renderTemplate("Hello {{name}}", {});
    expect(result.text).toBe("Hello ");
    expect(result.missingRequired).toEqual(["name"]);
  });

  it("does not report missing when fallback is provided", () => {
    const result = renderTemplate("{{x|default}}", {});
    expect(result.missingRequired).toEqual([]);
  });

  it("resolves dotted paths", () => {
    const result = renderTemplate("{{github.title}}", {
      github: { title: "Fix bug" },
    });
    expect(result.text).toBe("Fix bug");
  });

  it("stringifies arrays as comma-separated", () => {
    const result = renderTemplate("{{labels}}", { labels: ["bug", "critical"] });
    expect(result.text).toBe("bug, critical");
  });

  it("stringifies objects as JSON", () => {
    const result = renderTemplate("{{data}}", { data: { a: 1 } });
    expect(result.text).toBe('{"a":1}');
  });

  it("treats empty string as missing", () => {
    const result = renderTemplate("{{name|fallback}}", { name: "" });
    expect(result.text).toBe("fallback");
  });

  it("treats null as missing", () => {
    const result = renderTemplate("{{name|fallback}}", { name: null });
    expect(result.text).toBe("fallback");
  });

  it("handles multiple placeholders in one template", () => {
    const result = renderTemplate("{{a}} + {{b}} = {{c}}", {
      a: "1",
      b: "2",
      c: "3",
    });
    expect(result.text).toBe("1 + 2 = 3");
    expect(result.placeholdersUsed).toEqual(["a", "b", "c"]);
  });

  it("handles number values", () => {
    const result = renderTemplate("Issue #{{number}}", { number: 42 });
    expect(result.text).toBe("Issue #42");
  });

  it("handles boolean values", () => {
    const result = renderTemplate("Active: {{active}}", { active: true });
    expect(result.text).toBe("Active: true");
  });
});
