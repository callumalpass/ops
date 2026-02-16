import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock process module before importing agents.
vi.mock("../lib/process.js", () => ({
  execCapture: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
  execInteractive: vi.fn().mockResolvedValue(0),
}));

import { runAgent } from "../lib/agents.js";
import { execCapture, execInteractive } from "../lib/process.js";

const mockExecCapture = vi.mocked(execCapture);
const mockExecInteractive = vi.mocked(execInteractive);

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("claude interactive", () => {
    it("passes prompt as positional arg", async () => {
      await runAgent({
        cli: "claude",
        mode: "interactive",
        prompt: "do something",
        cwd: "/tmp",
      });

      expect(mockExecInteractive).toHaveBeenCalledWith(
        "claude",
        ["do something"],
        "/tmp",
      );
    });

    it("includes model and permission-mode flags", async () => {
      await runAgent({
        cli: "claude",
        mode: "interactive",
        prompt: "test",
        cwd: "/tmp",
        model: "opus",
        permissionMode: "plan",
      });

      const args = mockExecInteractive.mock.calls[0][1];
      expect(args).toContain("--model");
      expect(args).toContain("opus");
      expect(args).toContain("--permission-mode");
      expect(args).toContain("plan");
    });
  });

  describe("claude non-interactive", () => {
    it("uses -p flag with prompt as arg", async () => {
      await runAgent({
        cli: "claude",
        mode: "non-interactive",
        prompt: "do something",
        cwd: "/tmp",
      });

      expect(mockExecCapture).toHaveBeenCalledWith(
        "claude",
        ["-p", "do something"],
        "/tmp",
        undefined,
      );
    });
  });

  describe("codex interactive", () => {
    it("includes sandbox and approval-policy flags", async () => {
      await runAgent({
        cli: "codex",
        mode: "interactive",
        prompt: "test",
        cwd: "/work",
        sandboxMode: "workspace-write",
        approvalPolicy: "on-request",
      });

      const args = mockExecInteractive.mock.calls[0][1];
      expect(args).toContain("-s");
      expect(args).toContain("workspace-write");
      expect(args).toContain("-a");
      expect(args).toContain("on-request");
      expect(args).toContain("-C");
      expect(args).toContain("/work");
    });
  });

  describe("codex non-interactive", () => {
    it("passes prompt via stdin using - sentinel", async () => {
      await runAgent({
        cli: "codex",
        mode: "non-interactive",
        prompt: "do something",
        cwd: "/work",
      });

      expect(mockExecCapture).toHaveBeenCalledWith(
        "codex",
        expect.arrayContaining(["exec", "-"]),
        "/work",
        "do something",
      );
    });

    it("includes sandbox and -C flags", async () => {
      await runAgent({
        cli: "codex",
        mode: "non-interactive",
        prompt: "test",
        cwd: "/work",
        sandboxMode: "read-only",
        model: "o3",
      });

      const args = mockExecCapture.mock.calls[0][1];
      expect(args).toContain("-s");
      expect(args).toContain("read-only");
      expect(args).toContain("-m");
      expect(args).toContain("o3");
      expect(args).toContain("-C");
      expect(args).toContain("/work");
    });
  });
});
