import { describe, it, expect } from "vitest";
import { itemPath, handoffPath, commandPath } from "../lib/paths.js";

describe("itemPath", () => {
  it("generates issue path", () => {
    expect(itemPath("issue", 123)).toBe("items/issue-123.md");
  });

  it("generates pr path", () => {
    expect(itemPath("pr", 456)).toBe("items/pr-456.md");
  });
});

describe("handoffPath", () => {
  it("generates handoff path", () => {
    expect(handoffPath("issue-123-20240101")).toBe("handoffs/issue-123-20240101.md");
  });
});

describe("commandPath", () => {
  it("generates command path", () => {
    expect(commandPath("triage-issue")).toBe("commands/triage-issue.md");
  });
});
