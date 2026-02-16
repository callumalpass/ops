import { Command } from "commander";
import chalk from "chalk";
import { scaffoldOps } from "../lib/ops-schema.js";
import { resolveRepoRoot, resolveOpsRootMaybe } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { printError } from "../lib/cli-output.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize .ops at repository root")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--force", "Overwrite managed files")
    .action(async (opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const root = resolveOpsRootMaybe(repoRoot);
        const result = await scaffoldOps(root, Boolean(opts.force));

        // Validate that the fresh collection opens and types load.
        await withCollection(root, async () => undefined);

        if (opts.format === "json") {
          console.log(JSON.stringify({
            status: "initialized",
            repo_root: repoRoot,
            ops_root: root,
            created: result.created,
            skipped: result.skipped,
          }, null, 2));
          return;
        }

        console.log(chalk.green(`initialized ${root}`));
        if (result.created.length > 0) {
          console.log(chalk.bold("created:"));
          for (const file of result.created) console.log(`  ${file}`);
        }
        if (result.skipped.length > 0) {
          console.log(chalk.bold("skipped:"));
          for (const file of result.skipped) console.log(`  ${file}`);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
