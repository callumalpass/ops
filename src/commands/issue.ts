import { Command } from "commander";
import { executeRun } from "../lib/executor.js";
import { loadOpsConfig } from "../lib/config.js";
import { fetchProviderItem } from "../lib/providers/index.js";
import { readItem, upsertItemFromProvider } from "../lib/ops-data.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { printError } from "../lib/cli-output.js";
import { collect } from "../lib/cli-utils.js";
import type { AgentCli, ApprovalPolicy, ProviderId, RunMode, SandboxMode } from "../lib/types.js";

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasTriageAnalysis(frontmatter: Record<string, unknown>): boolean {
  return (
    hasNonEmptyString(frontmatter.summary)
    && hasNonEmptyString(frontmatter.priority)
    && hasNonEmptyString(frontmatter.difficulty)
    && hasNonEmptyString(frontmatter.risk)
  );
}

export function registerIssue(program: Command): void {
  const issue = program.command("issue").description("Issue-focused high-level workflows");

  issue
    .command("address")
    .description("Address an issue, auto-running triage first when sidecar analysis is missing")
    .requiredOption("--issue <number>", "Issue number")
    .option("--repo-root <path>", "Repository root")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .option("--address-command <id>", "Command id for address flow")
    .option("--triage-command <id>", "Command id for triage flow")
    .option("--skip-triage", "Skip automatic triage even if analysis fields are missing")
    .option("--force-triage", "Run triage before addressing regardless of sidecar state")
    .option("--triage-mode <mode>", "interactive|non-interactive", "non-interactive")
    .option("--mode <mode>", "interactive|non-interactive")
    .option("--interactive", "Alias for --mode interactive")
    .option("--non-interactive", "Alias for --mode non-interactive")
    .option("--cli <cli>", "claude|codex")
    .option("--model <model>", "Model override")
    .option("--permission-mode <mode>", "Permission mode override (claude: permission-mode, codex: approval-policy)")
    .option("--sandbox <mode>", "Sandbox mode for codex (read-only|workspace-write|danger-full-access)")
    .option("--approval-policy <policy>", "Approval policy for codex (untrusted|on-failure|on-request|never)")
    .option("--allowed-tool <tool>", "Allowed tool (repeatable)", collect, [])
    .option("--var <key=value>", "Template variable override for address command", collect, [])
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const number = Number.parseInt(String(opts.issue), 10);
        if (Number.isNaN(number) || number <= 0) {
          throw new Error(`Invalid issue number: ${opts.issue}`);
        }

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const repo = opts.repo ?? config.default_repo;
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;
        const triageCommandId = opts.triageCommand ?? config.commands.triage_issue;
        const addressCommandId = opts.addressCommand ?? config.commands.address_issue;

        let mode: RunMode | undefined = opts.mode;
        if (opts.interactive) mode = "interactive";
        if (opts.nonInteractive) mode = "non-interactive";

        const triageMode = (opts.triageMode as RunMode | undefined) ?? "non-interactive";
        const vars = parseKeyValuePairs(opts.var ?? [], false);
        const cli = opts.cli as AgentCli | undefined;
        const allowedTools = Array.isArray(opts.allowedTool) && opts.allowedTool.length > 0
          ? (opts.allowedTool as string[])
          : undefined;

        await withCollection(ops, async (collection) => {
          const remoteIssue = await fetchProviderItem("issue", number, repoRoot, repo, provider);
          await upsertItemFromProvider(collection, remoteIssue);

          const sidecar = await readItem(collection, "issue", number);
          const triageMissing = !hasTriageAnalysis(sidecar.frontmatter);
          const shouldRunTriage = Boolean(opts.forceTriage) || (!opts.skipTriage && triageMissing);

          let triageResult: { exitCode: number; stdout: string; stderr: string; mode: RunMode } | undefined;

          if (shouldRunTriage) {
            triageResult = await executeRun({
              collection,
              repoRoot,
              commandId: triageCommandId,
              kind: "issue",
              number,
              repo,
              provider,
              vars: {},
              ensureSidecar: true,
              mode: triageMode,
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

            if (triageResult.exitCode !== 0) {
              if (opts.format === "json") {
                console.log(JSON.stringify({
                  step: "triage",
                  command_id: triageCommandId,
                  exit_code: triageResult.exitCode,
                  stdout: triageResult.stdout,
                  stderr: triageResult.stderr,
                }, null, 2));
              }
              process.exit(triageResult.exitCode);
            }

            if (triageResult.mode === "non-interactive" && opts.format !== "json") {
              if (triageResult.stdout.trim()) {
                process.stdout.write(triageResult.stdout.endsWith("\n") ? triageResult.stdout : `${triageResult.stdout}\n`);
              }
              if (triageResult.stderr.trim()) {
                process.stderr.write(triageResult.stderr.endsWith("\n") ? triageResult.stderr : `${triageResult.stderr}\n`);
              }
            }
          }

          const addressResult = await executeRun({
            collection,
            repoRoot,
            commandId: addressCommandId,
            kind: "issue",
            number,
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
              issue: number,
              triage_ran: shouldRunTriage,
              triage_command_id: triageCommandId,
              address_command_id: addressCommandId,
              address_exit_code: addressResult.exitCode,
              address_stdout: addressResult.stdout,
              address_stderr: addressResult.stderr,
            }, null, 2));
          } else if (addressResult.mode === "non-interactive") {
            if (addressResult.stdout.trim()) {
              process.stdout.write(addressResult.stdout.endsWith("\n") ? addressResult.stdout : `${addressResult.stdout}\n`);
            }
            if (addressResult.stderr.trim()) {
              process.stderr.write(addressResult.stderr.endsWith("\n") ? addressResult.stderr : `${addressResult.stderr}\n`);
            }
          }

          if (addressResult.exitCode !== 0) {
            process.exit(addressResult.exitCode);
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
