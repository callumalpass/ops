import { Command } from "commander";
import chalk from "chalk";
import { loadOpsConfig } from "../lib/config.js";
import { fetchProviderItem } from "../lib/providers/index.js";
import { readItem, updateItemFields, upsertItemFromProvider } from "../lib/ops-data.js";
import { parseKeyValuePairs } from "../lib/parse.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
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

function resolveTarget(opts: { issue?: string; pr?: string }): { kind: "issue" | "pr"; number: number } {
  if (opts.issue && opts.pr) {
    throw new Error("Use only one of --issue or --pr.");
  }
  if (!opts.issue && !opts.pr) {
    throw new Error("Provide --issue or --pr.");
  }
  const raw = opts.issue ?? opts.pr!;
  const number = Number.parseInt(raw, 10);
  if (Number.isNaN(number) || number <= 0) {
    throw new Error(`Invalid item number: ${raw}`);
  }
  return { kind: opts.issue ? "issue" : "pr", number };
}

export function registerItemCommands(program: Command): void {
  const item = program.command("item").description("Manage issue/pr sidecar records");

  item
    .command("ensure")
    .description("Create or refresh sidecar from the configured provider")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .action(async (opts) => {
      try {
        const target = resolveTarget(opts);
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const remoteItem = await fetchProviderItem(
            target.kind,
            target.number,
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
    .option("--kind <kind>", "issue|pr")
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
              { field: "number", direction: "asc" },
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
            const number = String(fm.number ?? "?");
            const state = String(fm.local_status ?? "new");
            const title = String(fm.remote_title ?? "");
            const priority = fm.priority ? ` ${chalk.yellow(`[${String(fm.priority)}]`)}` : "";
            const difficulty = fm.difficulty ? ` ${chalk.magenta(`{${String(fm.difficulty)}}`)}` : "";
            console.log(`${chalk.bold(kind)} #${number} ${chalk.dim(state)}${priority}${difficulty}`);
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
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const target = resolveTarget(opts);
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const item = await readItem(collection, target.kind, target.number);
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
    .option("--field <key=value>", "Field assignment", (value: string, prev: string[]) => prev.concat([value]), [])
    .action(async (opts) => {
      try {
        const target = resolveTarget(opts);
        if (!opts.field || opts.field.length === 0) {
          throw new Error("Provide at least one --field key=value.");
        }
        const fields = parseKeyValuePairs(opts.field);

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const path = await updateItemFields(collection, target.kind, target.number, fields);
          if (opts.format === "json") {
            console.log(JSON.stringify({
              status: "updated",
              path,
              kind: target.kind,
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
