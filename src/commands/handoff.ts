import { Command } from "commander";
import chalk from "chalk";
import type { Collection } from "@callumalpass/mdbase";
import { handoffPath } from "../lib/paths.js";
import { readItem } from "../lib/ops-data.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { printError } from "../lib/cli-output.js";
import { collect } from "../lib/cli-utils.js";

function makeId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

interface HandoffRow {
  path: string;
  body?: string;
  frontmatter: Record<string, unknown>;
}

async function findHandoffById(collection: Collection, id: string): Promise<HandoffRow> {
  const where = `id == "${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const result = await collection.query({
    types: ["handoff"],
    where,
    limit: 2,
    include_body: true,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.results || result.results.length === 0) {
    throw new Error(`Handoff '${id}' not found.`);
  }
  if (result.results.length > 1) {
    throw new Error(`Handoff '${id}' is not unique.`);
  }
  const row = result.results[0];
  return {
    path: String(row.path),
    frontmatter: (row.frontmatter ?? {}) as Record<string, unknown>,
    body: typeof row.body === "string" ? row.body : undefined,
  };
}

export function registerHandoff(program: Command): void {
  const handoff = program.command("handoff").description("Manage handoff records");

  handoff
    .command("create")
    .description("Create a handoff linked to an item")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--id <id>", "Handoff id")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .requiredOption("--for-agent <name>", "Target agent/person")
    .option("--next-step <text>", "Next step (repeatable)", collect, [])
    .option("--blocker <text>", "Blocker (repeatable)", collect, [])
    .option("--created-by <name>", "Creator")
    .option("--body <text>", "Body markdown")
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

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const item = await readItem(collection, kind, number);
          const itemId = String(item.frontmatter.id ?? "");
          if (!itemId) {
            throw new Error(`Item sidecar missing id: ${item.path}`);
          }

          const id = opts.id || makeId(`${kind}-${number}`);
          const createResult = await collection.create({
            type: "handoff",
            path: handoffPath(id),
            frontmatter: {
              id,
              item_id: itemId,
              for_agent: opts.forAgent,
              status: "open",
              next_steps: opts.nextStep.length > 0 ? opts.nextStep : undefined,
              blockers: opts.blocker.length > 0 ? opts.blocker : undefined,
              created_by: opts.createdBy || process.env.USER || "unknown",
              created_at: new Date().toISOString(),
            },
            body: opts.body ?? "",
          });

          if (createResult.error) {
            throw new Error(createResult.error.message);
          }

          if (opts.format === "json") {
            console.log(JSON.stringify({
              status: "created",
              id,
              path: `handoffs/${id}.md`,
              item_id: itemId,
              for_agent: opts.forAgent,
            }, null, 2));
            return;
          }

          console.log(chalk.green(`created handoffs/${id}.md`));
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  handoff
    .command("list")
    .description("List handoffs")
    .option("--repo-root <path>", "Repository root")
    .option("--status <status>", "Filter by status")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const where = opts.status ? `status == "${String(opts.status).replace(/"/g, '\\"')}"` : undefined;
          const result = await collection.query({
            types: ["handoff"],
            where,
            order_by: [{ field: "created_at", direction: "desc" }],
          });
          if (result.error) throw new Error(result.error.message);

          if (opts.format === "json") {
            console.log(JSON.stringify(result.results ?? [], null, 2));
            return;
          }

          const rows = result.results ?? [];
          if (rows.length === 0) {
            console.log(chalk.dim("No handoffs found."));
            return;
          }

          for (const row of rows) {
            const fm = row.frontmatter as Record<string, unknown>;
            console.log(`${chalk.bold(String(fm.id ?? ""))} ${chalk.dim(String(fm.status ?? ""))}`);
            console.log(`  item: ${String(fm.item_id ?? "")}`);
            console.log(`  for: ${String(fm.for_agent ?? "")}`);
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  handoff
    .command("show <id>")
    .description("Show one handoff")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .action(async (id: string, opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const row = await findHandoffById(collection, id);
          if (opts.format === "json") {
            console.log(JSON.stringify(row, null, 2));
            return;
          }

          console.log(chalk.bold(String((row.frontmatter as Record<string, unknown>).id ?? id)));
          for (const [k, v] of Object.entries((row.frontmatter ?? {}) as Record<string, unknown>)) {
            console.log(`  ${chalk.cyan(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
          }
          if (row.body?.trim()) {
            console.log("---");
            console.log(row.body.trimEnd());
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  handoff
    .command("close <id>")
    .description("Mark handoff status as closed")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .action(async (id: string, opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const row = await findHandoffById(collection, id);
          const path = String(row.path);
          const update = await collection.update({
            path,
            fields: {
              status: "closed",
            },
          });
          if (update.error) {
            throw new Error(update.error.message);
          }
          if (opts.format === "json") {
            console.log(JSON.stringify({
              status: "closed",
              id,
              path,
            }, null, 2));
            return;
          }
          console.log(chalk.green(`closed ${id}`));
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
