import { Command } from "commander";
import chalk from "chalk";
import { executeRun, prepareRun } from "../lib/executor.js";
import { loadOpsConfig } from "../lib/config.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { parseTargetOptions } from "../lib/targets.js";
import type { AgentCli, ApprovalPolicy, ProviderId, RunMode, SandboxMode } from "../lib/types.js";
import { printError } from "../lib/cli-output.js";
import { collect } from "../lib/cli-utils.js";

export function registerRun(program: Command): void {
  program
    .command("run <commandId>")
    .description("Run a command template via an agent CLI")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--task <ref>", "Task title or path (for example tasks/my-task.md)")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .option("--mode <mode>", "interactive|non-interactive")
    .option("--interactive", "Alias for --mode interactive")
    .option("--non-interactive", "Alias for --mode non-interactive")
    .option("--cli <cli>", "claude|codex")
    .option("--model <model>", "Model override")
    .option("--permission-mode <mode>", "Permission mode override (claude: permission-mode, codex: approval-policy)")
    .option("--sandbox <mode>", "Sandbox mode for codex (read-only|workspace-write|danger-full-access)")
    .option("--approval-policy <policy>", "Approval policy for codex (untrusted|on-failure|on-request|never)")
    .option("--allowed-tool <tool>", "Allowed tool (repeatable)", collect, [])
    .option("--var <key=value>", "Template variable override", collect, [])
    .option("--print-prompt", "Print rendered prompt before execution")
    .option("--dry-run", "Render only; do not execute")
    .option("--format <format>", "text|json", "text")
    .action(async (commandId: string, opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const vars = parseKeyValuePairs(opts.var ?? [], false);
        const target = parseTargetOptions(opts, false);

        let mode: RunMode | undefined = opts.mode;
        if (opts.interactive) mode = "interactive";
        if (opts.nonInteractive) mode = "non-interactive";
        const repo = opts.repo ?? config.default_repo;
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;

        const cli = opts.cli as AgentCli | undefined;
        const allowedTools = Array.isArray(opts.allowedTool) && opts.allowedTool.length > 0
          ? (opts.allowedTool as string[])
          : undefined;

        await withCollection(ops, async (collection) => {
          if (opts.dryRun) {
            const prepared = await prepareRun({
              collection,
              repoRoot,
              commandId,
              target,
              repo,
              provider,
              vars,
              ensureSidecar: true,
            });

            if (prepared.missingRequired.length > 0) {
              throw new Error(
                `Missing template variables: ${prepared.missingRequired.join(", ")}. Provide with --var or select an --issue/--pr/--task context.`,
              );
            }

            if (opts.format === "json") {
              console.log(JSON.stringify({ prompt: prepared.renderedPrompt }, null, 2));
            } else {
              console.log(prepared.renderedPrompt);
            }
            return;
          }

          // Print prompt before execution so it's useful for debugging.
          if (opts.printPrompt) {
            const prepared = await prepareRun({
              collection,
              repoRoot,
              commandId,
              target,
              repo,
              provider,
              vars,
              ensureSidecar: true,
            });

            if (opts.format === "json") {
              console.log(JSON.stringify({ prompt: prepared.renderedPrompt }, null, 2));
            } else {
              console.log(chalk.bold("Rendered prompt"));
              console.log(prepared.renderedPrompt);
              console.log();
            }
          }

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

          if (opts.format === "json") {
            console.log(JSON.stringify({
              exit_code: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            }, null, 2));
          } else if (result.mode === "non-interactive") {
            if (result.stdout.trim()) {
              process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
            }
            if (result.stderr.trim()) {
              process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
            }
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
