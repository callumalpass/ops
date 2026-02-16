import { execCapture, execInteractive } from "./process.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  if (input.mode === "interactive") {
    const interactiveExit = await execInteractive(...buildInteractiveCommand(input));
    return {
      exitCode: interactiveExit,
      stdout: "",
      stderr: "",
    };
  }
  const [cmd, args, cwd] = buildNonInteractiveCommand(input);
  return execCapture(cmd, args, cwd);
}

function buildInteractiveCommand(input: AgentRunInput): [string, string[], string] {
  if (input.cli === "claude") {
    const args: string[] = [];
    if (input.model) args.push("--model", input.model);
    if (input.permissionMode) args.push("--permission-mode", input.permissionMode);
    if (input.allowedTools && input.allowedTools.length > 0) {
      args.push("--allowed-tools", input.allowedTools.join(","));
    }
    args.push(input.prompt);
    return ["claude", args, input.cwd];
  }

  const args: string[] = [];
  if (input.model) args.push("-m", input.model);
  args.push(input.prompt);
  return ["codex", args, input.cwd];
}

function buildNonInteractiveCommand(input: AgentRunInput): [string, string[], string] {
  if (input.cli === "claude") {
    const args: string[] = ["-p", input.prompt];
    if (input.model) args.push("--model", input.model);
    if (input.permissionMode) args.push("--permission-mode", input.permissionMode);
    if (input.allowedTools && input.allowedTools.length > 0) {
      args.push("--allowed-tools", input.allowedTools.join(","));
    }
    return ["claude", args, input.cwd];
  }

  const args: string[] = ["exec", input.prompt];
  if (input.model) args.push("-m", input.model);
  return ["codex", args, input.cwd];
}
