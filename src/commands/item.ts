import { Command } from "commander";
import chalk from "chalk";
import { loadOpsConfig } from "../lib/config.js";
import { fetchLocalTaskItem } from "../lib/local-tasks.js";
import { fetchProviderItem } from "../lib/providers/index.js";
import { readItem, updateItemFields, upsertItemFromProvider } from "../lib/ops-data.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { parseTargetOptions } from "../lib/targets.js";
import { printError } from "../lib/cli-output.js";
import type { ProviderId } from "../lib/types.js";

function makeWhere(opts: { kind?: string; status?: string; priority?: string; difficulty?: string }): string | undefined {
  const clauses: string[] = [];
  if (opts.kind) clauses.push(`kind == "${opts.kind.replace(/"/g, '\\"')}"`);
  if (opts.status) clauses.push(`local_status == "${opts.status.replace(/"/g, '\\"')}"`);
  if (opts.priority) clauses.push(`priority == "${opts.priority.replace(/"/g, '\\"')}"`);
  if (opts.difficulty) clauses.push(`difficulty == "${opts.difficulty.replace(/"/g, '\\"')}"`);
  if (clauses.length === 0) return undefined;
  return clauses.join(" && ");
}

export function registerItemCommands(program: Command): void {
  const item = program.command("item").description("Manage sidecar records for issues, PRs, and tasks");

  item
    .command("ensure")
    .description("Create or refresh sidecar from the configured provider")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--task <ref>", "Task title or path (for example tasks/my-task.md)")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .action(async (opts) => {
      try {
        const target = parseTargetOptions(opts, true);
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const remoteItem = target.kind === "task"
            ? await fetchLocalTaskItem(collection, target.key)
            : await fetchProviderItem(
              target.kind,
              target.number!,
              repoRoot,
              opts.repo ?? config.default_repo,
              provider,
            );
          const path = await upsertItemFromProvider(collection, remoteItem);
          if (opts.format === "json") {
            console.log(JSON.stringify({
              status: "updated",
              path,
              kind: target.kind,
              key: target.key,
              number: target.number,
              repo: remoteItem.repo,
            }, null, 2));
            return;
          }
          console.log(chalk.green(`updated ${path}`));
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  item
    .command("list")
    .description("List sidecar items")
    .option("--repo-root <path>", "Repository root")
    .option("--kind <kind>", "issue|pr|task")
    .option("--status <status>", "Filter by local_status")
    .option("--priority <priority>", "Filter by priority")
    .option("--difficulty <difficulty>", "Filter by difficulty")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        await withCollection(ops, async (collection) => {
          const where = makeWhere({
            kind: opts.kind,
            status: opts.status,
            priority: opts.priority,
            difficulty: opts.difficulty,
          });
          const result = await collection.query({
            types: ["item_state"],
            where,
            order_by: [
              { field: "kind", direction: "asc" },
              { field: "key", direction: "asc" },
            ],
          });

          if (result.error) {
            throw new Error(result.error.message);
          }

          const rows = result.results ?? [];
          if (opts.format === "json") {
            console.log(JSON.stringify(rows, null, 2));
            return;
          }

          if (rows.length === 0) {
            console.log(chalk.dim("No item sidecars found."));
            return;
          }

          for (const row of rows) {
            const fm = row.frontmatter as Record<string, unknown>;
            const kind = String(fm.kind ?? "?");
            const key = String(fm.key ?? fm.number ?? "?");
            const state = String(fm.local_status ?? "new");
            const title = String(fm.remote_title ?? "");
            const priority = fm.priority ? ` ${chalk.yellow(`[${String(fm.priority)}]`)}` : "";
            const difficulty = fm.difficulty ? ` ${chalk.magenta(`{${String(fm.difficulty)}}`)}` : "";
            console.log(`${chalk.bold(kind)} ${chalk.dim(key)} ${chalk.dim(state)}${priority}${difficulty}`);
            if (title) console.log(`  ${title}`);
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  item
    .command("show")
    .description("Show a sidecar item")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--task <ref>", "Task title or path (for example tasks/my-task.md)")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const target = parseTargetOptions(opts, true);
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const item = await readItem(collection, target);
          if (opts.format === "json") {
            console.log(JSON.stringify(item, null, 2));
            return;
          }

          console.log(chalk.bold(item.path));
          for (const [k, v] of Object.entries(item.frontmatter)) {
            console.log(`  ${chalk.cyan(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
          }
          if (item.body.trim()) {
            console.log("---");
            console.log(item.body.trimEnd());
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  item
    .command("set")
    .description("Set one or more sidecar fields")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--task <ref>", "Task title or path (for example tasks/my-task.md)")
    .option("--field <key=value>", "Field assignment", (value: string, prev: string[]) => prev.concat([value]), [])
    .action(async (opts) => {
      try {
        const target = parseTargetOptions(opts, true);
        if (!opts.field || opts.field.length === 0) {
          throw new Error("Provide at least one --field key=value.");
        }
        const fields = parseKeyValuePairs(opts.field);

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const path = await updateItemFields(collection, target, fields);
          if (opts.format === "json") {
            console.log(JSON.stringify({
              status: "updated",
              path,
              kind: target.kind,
              key: target.key,
              number: target.number,
              fields,
            }, null, 2));
            return;
          }
          console.log(chalk.green(`updated ${path}`));
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
