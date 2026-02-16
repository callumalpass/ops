import { describe, it, expect } from "vitest";
import { parseValue, parseKeyValuePairs } from "../lib/parse.js";

describe("parseValue", () => {
  it("converts 'true' to boolean", () => {
    expect(parseValue("true")).toBe(true);
  });

  it("converts 'false' to boolean", () => {
    expect(parseValue("false")).toBe(false);
  });

  it("converts 'null' to null", () => {
    expect(parseValue("null")).toBe(null);
  });

  it("converts integer strings to numbers", () => {
    expect(parseValue("42")).toBe(42);
    expect(parseValue("-7")).toBe(-7);
  });

  it("converts float strings to numbers", () => {
    expect(parseValue("3.14")).toBe(3.14);
    expect(parseValue("-2.5")).toBe(-2.5);
  });

  it("parses JSON arrays", () => {
    expect(parseValue('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it("parses JSON objects", () => {
    expect(parseValue('{"a": 1}')).toEqual({ a: 1 });
  });

  it("returns raw string for non-special values", () => {
    expect(parseValue("hello")).toBe("hello");
  });

  it("returns raw string for partial numbers", () => {
    expect(parseValue("42abc")).toBe("42abc");
  });

  it("returns raw string for malformed JSON", () => {
    expect(parseValue("[invalid")).toBe("[invalid");
  });
});

describe("parseKeyValuePairs", () => {
  it("parses simple key=value pairs with coercion", () => {
    const result = parseKeyValuePairs(["key=value", "n=42"], true);
    expect(result).toEqual({ key: "value", n: 42 });
  });

  it("parses without coercion (strings only)", () => {
    const result = parseKeyValuePairs(["n=42", "b=true", "x=null"], false);
    expect(result).toEqual({ n: "42", b: "true", x: "null" });
  });

  it("defaults to coercion enabled", () => {
    const result = parseKeyValuePairs(["n=42"]);
    expect(result).toEqual({ n: 42 });
  });

  it("handles values containing equals signs", () => {
    const result = parseKeyValuePairs(["expr=a=b"], false);
    expect(result).toEqual({ expr: "a=b" });
  });

  it("throws on missing equals sign", () => {
    expect(() => parseKeyValuePairs(["noequals"])).toThrow("Invalid key=value pair");
  });

  it("throws on empty key", () => {
    expect(() => parseKeyValuePairs(["=value"])).toThrow("Invalid key");
  });

  it("handles empty value", () => {
    const result = parseKeyValuePairs(["key="], false);
    expect(result).toEqual({ key: "" });
  });
});
