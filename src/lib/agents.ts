import { execCapture, execInteractive } from "./process.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

interface AgentCommand {
  cmd: string;
  args: string[];
  cwd: string;
  stdin?: string;
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  if (input.mode === "interactive") {
    const { cmd, args, cwd } = buildInteractiveCommand(input);
    const interactiveExit = await execInteractive(cmd, args, cwd);
    return {
      exitCode: interactiveExit,
      stdout: "",
      stderr: "",
    };
  }
  const { cmd, args, cwd, stdin } = buildNonInteractiveCommand(input);
  return execCapture(cmd, args, cwd, stdin);
}

function buildInteractiveCommand(input: AgentRunInput): AgentCommand {
  if (input.cli === "claude") {
    const args: string[] = [];
    if (input.model) args.push("--model", input.model);
    if (input.permissionMode) args.push("--permission-mode", input.permissionMode);
    if (input.allowedTools && input.allowedTools.length > 0) {
      args.push("--allowed-tools", input.allowedTools.join(","));
    }
    args.push(input.prompt);
    return { cmd: "claude", args, cwd: input.cwd };
  }

  // codex interactive
  const args: string[] = [];
  if (input.model) args.push("-m", input.model);
  if (input.sandboxMode) args.push("-s", input.sandboxMode);
  if (input.approvalPolicy) args.push("-a", input.approvalPolicy);
  args.push("-C", input.cwd);
  args.push(input.prompt);
  return { cmd: "codex", args, cwd: input.cwd };
}

function buildNonInteractiveCommand(input: AgentRunInput): AgentCommand {
  if (input.cli === "claude") {
    const args: string[] = ["-p", input.prompt];
    if (input.model) args.push("--model", input.model);
    if (input.permissionMode) args.push("--permission-mode", input.permissionMode);
    if (input.allowedTools && input.allowedTools.length > 0) {
      args.push("--allowed-tools", input.allowedTools.join(","));
    }
    return { cmd: "claude", args, cwd: input.cwd };
  }

  // codex exec: pass prompt via stdin using "-" sentinel to avoid ARG_MAX issues.
  const args: string[] = ["exec", "-"];
  if (input.model) args.push("-m", input.model);
  if (input.sandboxMode) args.push("-s", input.sandboxMode);
  args.push("-C", input.cwd);
  return { cmd: "codex", args, cwd: input.cwd, stdin: input.prompt };
}
