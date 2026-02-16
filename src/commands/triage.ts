import { Command } from "commander";
import { executeRun } from "../lib/executor.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { printError } from "../lib/cli-output.js";

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function registerTriage(program: Command): void {
  program
    .command("triage")
    .description("Run the default triage command for an issue or PR")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--repo <owner/repo>", "GitHub repo override")
    .option("--command <id>", "Override command id")
    .option("--interactive", "Interactive mode")
    .option("--non-interactive", "Non-interactive mode")
    .option("--var <key=value>", "Template variable override", collect, [])
    .action(async (opts) => {
      try {
        if (opts.issue && opts.pr) {
          throw new Error("Use only one of --issue or --pr.");
        }
        if (!opts.issue && !opts.pr) {
          throw new Error("Provide --issue or --pr.");
        }

        const kind = opts.issue ? "issue" : "pr";
        const number = Number.parseInt(opts.issue ?? opts.pr, 10);
        if (Number.isNaN(number) || number <= 0) {
          throw new Error("Invalid item number.");
        }

        const commandId = opts.command || (kind === "issue" ? "triage-issue" : "review-pr");
        const mode = opts.nonInteractive ? "non-interactive" : opts.interactive ? "interactive" : undefined;
        const vars = parseKeyValuePairs(opts.var ?? []);

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const result = await executeRun({
            collection,
            repoRoot,
            commandId,
            kind,
            number,
            repo: opts.repo,
            vars,
            ensureSidecar: true,
            mode,
          });

          if (mode === "non-interactive" && result.stdout.trim()) {
            process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
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
