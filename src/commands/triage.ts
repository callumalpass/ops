import { Command } from "commander";
import { executeRun } from "../lib/executor.js";
import { loadOpsConfig } from "../lib/config.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { printError } from "../lib/cli-output.js";
import { collect } from "../lib/cli-utils.js";
import { parseTargetOptions } from "../lib/targets.js";
import type { AgentCli, ApprovalPolicy, ProviderId, RunMode, SandboxMode } from "../lib/types.js";

export function registerTriage(program: Command): void {
  program
    .command("triage")
    .description("Run the default triage command for an issue, PR, or task")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--task <ref>", "Task title or path (for example tasks/my-task.md)")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .option("--command <id>", "Override command id")
    .option("--mode <mode>", "interactive|non-interactive")
    .option("--interactive", "Interactive mode")
    .option("--non-interactive", "Non-interactive mode")
    .option("--cli <cli>", "claude|codex")
    .option("--model <model>", "Model override")
    .option("--permission-mode <mode>", "Permission mode override (claude: permission-mode, codex: approval-policy)")
    .option("--sandbox <mode>", "Sandbox mode for codex (read-only|workspace-write|danger-full-access)")
    .option("--approval-policy <policy>", "Approval policy for codex (untrusted|on-failure|on-request|never)")
    .option("--allowed-tool <tool>", "Allowed tool (repeatable)", collect, [])
    .option("--var <key=value>", "Template variable override", collect, [])
    .action(async (opts) => {
      try {
        const target = parseTargetOptions(opts, true);

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const commandId = opts.command || (
          target.kind === "issue"
            ? config.commands.triage_issue
            : target.kind === "pr"
              ? config.commands.review_pr
              : config.commands.triage_task
        );
        let mode: RunMode | undefined = opts.mode;
        if (opts.nonInteractive) mode = "non-interactive";
        if (opts.interactive) mode = "interactive";
        const repo = opts.repo ?? config.default_repo;
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;
        const cli = opts.cli as AgentCli | undefined;
        const allowedTools = Array.isArray(opts.allowedTool) && opts.allowedTool.length > 0
          ? (opts.allowedTool as string[])
          : undefined;
        const vars = parseKeyValuePairs(opts.var ?? [], false);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const result = await executeRun({
            collection,
            repoRoot,
            commandId,
            target,
            repo,
            provider,
            vars,
            ensureSidecar: true,
            mode,
            cli,
            model: opts.model,
            permissionMode: opts.permissionMode,
            allowedTools,
            sandboxMode: opts.sandbox as SandboxMode | undefined,
            approvalPolicy: opts.approvalPolicy as ApprovalPolicy | undefined,
            defaults: {
              mode: config.default_mode,
              cli: config.default_cli,
              model: config.default_model,
              permissionMode: config.default_permission_mode,
              allowedTools: config.default_allowed_tools,
              sandboxMode: config.default_sandbox_mode,
              approvalPolicy: config.default_approval_policy,
            },
          });

          if (result.mode === "non-interactive" && result.stdout.trim()) {
            process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
          }
          if (result.mode === "non-interactive" && result.stderr.trim()) {
            process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
          }

          if (result.exitCode !== 0) {
            process.exit(result.exitCode);
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
