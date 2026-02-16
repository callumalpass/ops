import { Command } from "commander";
import chalk from "chalk";
import { executeRun, prepareRun } from "../lib/executor.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import type { AgentCli, ItemKind, RunMode } from "../lib/types.js";
import { printError } from "../lib/cli-output.js";

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function pickTarget(opts: { issue?: string; pr?: string }): { kind?: ItemKind; number?: number } {
  if (opts.issue && opts.pr) {
    throw new Error("Use only one of --issue or --pr.");
  }
  if (!opts.issue && !opts.pr) {
    return {};
  }
  const raw = opts.issue ?? opts.pr;
  const number = Number.parseInt(String(raw), 10);
  if (Number.isNaN(number) || number <= 0) {
    throw new Error(`Invalid item number: ${raw}`);
  }
  return {
    kind: opts.issue ? "issue" : "pr",
    number,
  };
}

export function registerRun(program: Command): void {
  program
    .command("run <commandId>")
    .description("Run a command template via an agent CLI")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--repo <owner/repo>", "GitHub repo override")
    .option("--mode <mode>", "interactive|non-interactive")
    .option("--interactive", "Alias for --mode interactive")
    .option("--non-interactive", "Alias for --mode non-interactive")
    .option("--cli <cli>", "claude|codex")
    .option("--model <model>", "Model override")
    .option("--permission-mode <mode>", "Permission mode override")
    .option("--allowed-tool <tool>", "Allowed tool (repeatable)", collect, [])
    .option("--var <key=value>", "Template variable override", collect, [])
    .option("--print-prompt", "Print rendered prompt before execution")
    .option("--dry-run", "Render only; do not execute")
    .option("--format <format>", "text|json", "text")
    .action(async (commandId: string, opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        const vars = parseKeyValuePairs(opts.var ?? []);
        const target = pickTarget(opts);

        let mode: RunMode | undefined = opts.mode;
        if (opts.interactive) mode = "interactive";
        if (opts.nonInteractive) mode = "non-interactive";

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
              kind: target.kind,
              number: target.number,
              repo: opts.repo,
              vars,
              ensureSidecar: true,
            });

            if (prepared.missingRequired.length > 0) {
              throw new Error(
                `Missing template variables: ${prepared.missingRequired.join(", ")}. Provide with --var or select an issue/pr context.`,
              );
            }

            if (opts.format === "json") {
              console.log(JSON.stringify({ prompt: prepared.renderedPrompt }, null, 2));
            } else {
              console.log(prepared.renderedPrompt);
            }
            return;
          }

          const result = await executeRun({
            collection,
            repoRoot,
            commandId,
            kind: target.kind,
            number: target.number,
            repo: opts.repo,
            vars,
            ensureSidecar: true,
            mode,
            cli,
            model: opts.model,
            permissionMode: opts.permissionMode,
            allowedTools,
          });

          if (opts.printPrompt) {
            if (opts.format === "json") {
              console.log(JSON.stringify({ prompt: result.prompt }, null, 2));
            } else {
              console.log(chalk.bold("Rendered prompt"));
              console.log(result.prompt);
            }
          }

          if (opts.format === "json") {
            console.log(JSON.stringify({
              exit_code: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            }, null, 2));
          } else if (mode === "non-interactive" || opts.nonInteractive) {
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
