import type { Collection } from "@callumalpass/mdbase";
import { runAgent } from "./agents.js";
import { buildContext } from "./context-builder.js";
import { getCommandById } from "./ops-data.js";
import { renderTemplate } from "./template.js";
import type { AgentCli, ApprovalPolicy, ItemKind, RunMode, SandboxMode } from "./types.js";

export interface PrepareRunInput {
  collection: Collection;
  repoRoot: string;
  commandId: string;
  kind?: ItemKind;
  number?: number;
  repo?: string;
  vars?: Record<string, unknown>;
  ensureSidecar: boolean;
}

export interface PreparedRun {
  command: Awaited<ReturnType<typeof getCommandById>>;
  context: Record<string, unknown>;
  renderedPrompt: string;
  missingRequired: string[];
  item?: { kind: ItemKind; number: number };
}

export async function prepareRun(input: PrepareRunInput): Promise<PreparedRun> {
  const command = await getCommandById(input.collection, input.commandId);
  const built = await buildContext({
    collection: input.collection,
    repoRoot: input.repoRoot,
    kind: input.kind,
    number: input.number,
    repo: input.repo,
    explicitVars: input.vars,
    ensureSidecar: input.ensureSidecar,
  });

  const rendered = renderTemplate(command.body, built.context);
  return {
    command,
    context: built.context,
    renderedPrompt: rendered.text,
    missingRequired: rendered.missingRequired,
    item: input.kind && typeof input.number === "number" ? { kind: input.kind, number: input.number } : undefined,
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
}

export async function executeRun(input: ExecuteRunInput): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  prompt: string;
}> {
  const prepared = await prepareRun(input);
  if (prepared.missingRequired.length > 0) {
    throw new Error(
      `Missing template variables: ${prepared.missingRequired.join(", ")}. Provide with --var or select an issue/pr context.`,
    );
  }

  const fm = prepared.command.frontmatter;
  const mode: RunMode = input.mode ?? fm.default_mode ?? "interactive";
  const cli: AgentCli = input.cli ?? fm.cli_type ?? "claude";

  const result = await runAgent({
    cli,
    mode,
    prompt: prepared.renderedPrompt,
    cwd: input.repoRoot,
    model: input.model ?? fm.model,
    permissionMode: input.permissionMode ?? fm.permission_mode,
    allowedTools: input.allowedTools ?? fm.allowed_tools,
    sandboxMode: input.sandboxMode ?? fm.sandbox_mode,
    approvalPolicy: input.approvalPolicy ?? fm.approval_policy,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    prompt: prepared.renderedPrompt,
  };
}
