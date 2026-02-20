import type { Collection } from "@callumalpass/mdbase";
import { runAgent } from "./agents.js";
import { buildContext } from "./context-builder.js";
import { getCommandById } from "./ops-data.js";
import { renderTemplate } from "./template.js";
import type { ItemTarget } from "./targets.js";
import type { AgentCli, ApprovalPolicy, ProviderId, RunMode, SandboxMode } from "./types.js";

export interface PrepareRunInput {
  collection: Collection;
  repoRoot: string;
  commandId: string;
  target?: ItemTarget;
  repo?: string;
  provider?: ProviderId;
  vars?: Record<string, unknown>;
  ensureSidecar: boolean;
}

export interface PreparedRun {
  command: Awaited<ReturnType<typeof getCommandById>>;
  context: Record<string, unknown>;
  renderedPrompt: string;
  missingRequired: string[];
  item?: ItemTarget;
}

export async function prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
  const command = await getCommandById(input.collection, input.commandId);
  const built = await buildContext({
    collection: input.collection,
    repoRoot: input.repoRoot,
    target: input.target,
    repo: input.repo,
    provider: input.provider,
    explicitVars: input.vars,
    ensureSidecar: input.ensureSidecar,
  });

  const rendered = renderTemplate(command.body, built.context);
  return {
    command,
    context: built.context,
    renderedPrompt: rendered.text,
    missingRequired: rendered.missingRequired,
    item: input.target,
  };
}

export interface ExecuteRunInput extends PrepareRunInput {
  mode?: RunMode;
  cli?: AgentCli;
  model?: string;
  permissionMode?: string;
  allowedTools?: string[];
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  defaults?: {
    mode?: RunMode;
    cli?: AgentCli;
    model?: string;
    permissionMode?: string;
    allowedTools?: string[];
    sandboxMode?: SandboxMode;
    approvalPolicy?: ApprovalPolicy;
  };
}

export async function executeRun(input: ExecuteRunInput): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  prompt: string;
  mode: RunMode;
}> {
  const prepared = await prepareRun(input);
  if (prepared.missingRequired.length > 0) {
    throw new Error(
      `Missing template variables: ${prepared.missingRequired.join(", ")}. Provide with --var or select an --issue/--pr/--task context.`,
    );
  }

  const fm = prepared.command.frontmatter;
  const defaults = input.defaults ?? {};
  const mode: RunMode = input.mode ?? fm.default_mode ?? defaults.mode ?? "interactive";
  const cli: AgentCli = input.cli ?? fm.cli_type ?? defaults.cli ?? "claude";

  const result = await runAgent({
    cli,
    mode,
    prompt: prepared.renderedPrompt,
    cwd: input.repoRoot,
    model: input.model ?? fm.model ?? defaults.model,
    permissionMode: input.permissionMode ?? fm.permission_mode ?? defaults.permissionMode,
    allowedTools: input.allowedTools ?? fm.allowed_tools ?? defaults.allowedTools,
    sandboxMode: input.sandboxMode ?? fm.sandbox_mode ?? defaults.sandboxMode,
    approvalPolicy: input.approvalPolicy ?? fm.approval_policy ?? defaults.approvalPolicy,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    prompt: prepared.renderedPrompt,
    mode,
  };
}
