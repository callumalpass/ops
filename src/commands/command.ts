import { Command } from "commander";
import { promises as fs } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";
import { parseKeyValuePairs } from "../lib/parse.js";
import { commandPath } from "../lib/paths.js";
import { prepareRun } from "../lib/executor.js";
import { listCommands, getCommandById } from "../lib/ops-data.js";
import { loadOpsConfig } from "../lib/config.js";
import { resolveRepoRoot, resolveOpsRoot } from "../lib/runtime.js";
import { withCollection } from "../lib/store.js";
import { writeFileForce } from "../lib/fs.js";
import { printError } from "../lib/cli-output.js";
import { collect } from "../lib/cli-utils.js";
import type { ProviderId } from "../lib/types.js";

function defaultName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

export function registerCommandCommands(program: Command): void {
  const command = program.command("command").description("Manage .ops command templates");

  command
    .command("list")
    .description("List commands")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        await withCollection(ops, async (collection) => {
          const commands = await listCommands(collection);
          if (opts.format === "json") {
            console.log(JSON.stringify(commands, null, 2));
            return;
          }

          if (commands.length === 0) {
            console.log(chalk.dim("No commands found."));
            return;
          }

          for (const cmd of commands) {
            const fm = cmd.frontmatter;
            const active = fm.active === false ? chalk.red("inactive") : chalk.green("active");
            console.log(`${chalk.bold(fm.id)}  ${chalk.dim(fm.scope)}  ${active}`);
            if (fm.description) console.log(`  ${chalk.dim(fm.description)}`);
          }
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("show <id>")
    .description("Show command frontmatter + template")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json|yaml", "text")
    .action(async (id: string, opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        await withCollection(ops, async (collection) => {
          const cmd = await getCommandById(collection, id);
          if (opts.format === "json") {
            console.log(JSON.stringify(cmd, null, 2));
            return;
          }
          if (opts.format === "yaml") {
            console.log(yaml.dump(cmd, { lineWidth: -1, noRefs: true }).trimEnd());
            return;
          }

          console.log(chalk.bold(cmd.frontmatter.id));
          console.log(chalk.dim(`path: ${cmd.path}`));
          console.log();
          console.log(yaml.dump(cmd.frontmatter, { lineWidth: -1, noRefs: true }).trimEnd());
          console.log("---");
          console.log(cmd.body.trimEnd());
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("new <id>")
    .description("Create a new command template")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .option("--name <name>", "Display name")
    .option("--scope <scope>", "issue|pr|general", "general")
    .option("--description <description>", "Short description")
    .option("--cli <cli>", "claude|codex", "claude")
    .option("--mode <mode>", "interactive|non-interactive", "interactive")
    .option("--model <model>", "Default model")
    .option("--permission-mode <mode>", "Default permission mode")
    .option("--sandbox-mode <mode>", "Default sandbox mode (codex): read-only|workspace-write|danger-full-access")
    .option("--approval-policy <policy>", "Default approval policy (codex): untrusted|on-failure|on-request|never")
    .option("--allowed-tool <tool>", "Allowed tool (repeatable)", collect, [])
    .option("--template-file <path>", "Read markdown body from file")
    .option("--force", "Overwrite if existing")
    .action(async (id: string, opts) => {
      try {
        if (!/^[a-z0-9-]+$/.test(id)) {
          throw new Error("Command id must match ^[a-z0-9-]+$.");
        }

        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);
        const relPath = commandPath(id);
        const fullPath = path.join(ops, relPath);

        const frontmatter: Record<string, unknown> = {
          type: "command",
          id,
          name: opts.name || defaultName(id),
          scope: opts.scope,
          description: opts.description || "",
          cli_type: opts.cli,
          active: true,
          default_mode: opts.mode,
        };

        if (opts.model) frontmatter.model = opts.model;
        if (opts.permissionMode) frontmatter.permission_mode = opts.permissionMode;
        if (opts.sandboxMode) frontmatter.sandbox_mode = opts.sandboxMode;
        if (opts.approvalPolicy) frontmatter.approval_policy = opts.approvalPolicy;
        if (Array.isArray(opts.allowedTool) && opts.allowedTool.length > 0) {
          frontmatter.allowed_tools = opts.allowedTool;
        }

        let body = "Write your prompt template here. Use {{vars}} placeholders.\n";
        if (opts.templateFile) {
          body = await fs.readFile(path.resolve(opts.templateFile), "utf8");
        }

        const content = `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd()}\n---\n\n${body.trimEnd()}\n`;

        if (!opts.force) {
          let exists = false;
          try {
            await fs.access(fullPath);
            exists = true;
          } catch {
            exists = false;
          }
          if (exists) {
            throw new Error(`Command already exists at ${relPath}. Use --force to overwrite.`);
          }
        }

        await writeFileForce(fullPath, content);
        if (opts.format === "json") {
          console.log(JSON.stringify({
            status: "created",
            id,
            path: relPath,
          }, null, 2));
          return;
        }
        console.log(chalk.green(`created ${relPath}`));
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("validate")
    .description("Validate command records")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      try {
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const result = await collection.validate();
          const issues = (result.issues ?? []).filter((issue) =>
            String(issue.path ?? "").startsWith("commands/"),
          );

          if (opts.format === "json") {
            console.log(JSON.stringify({ valid: issues.length === 0, issues }, null, 2));
            return;
          }

          if (issues.length === 0) {
            console.log(chalk.green("commands valid"));
            return;
          }

          console.log(chalk.red(`commands invalid (${issues.length} issues)`));
          for (const issue of issues) {
            const pathLabel = issue.path ? `${issue.path}: ` : "";
            const fieldLabel = issue.field ? `${issue.field}: ` : "";
            console.log(`  ${pathLabel}${fieldLabel}${issue.message} ${chalk.dim(`[${issue.code}]`)}`);
          }
          process.exit(2);
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("render <id>")
    .description("Render a command template with context")
    .option("--repo-root <path>", "Repository root")
    .option("--issue <number>", "Issue number")
    .option("--pr <number>", "PR number")
    .option("--repo <scope>", "Provider scope override (for example owner/repo)")
    .option("--provider <provider>", "Provider override (github|gitlab|jira|azure)")
    .option("--var <key=value>", "Template variable override", collect, [])
    .option("--show-context", "Print merged context")
    .option("--format <format>", "text|json", "text")
    .action(async (id: string, opts) => {
      try {
        if (opts.issue && opts.pr) {
          throw new Error("Use only one of --issue or --pr.");
        }

        const vars = parseKeyValuePairs(opts.var ?? [], false);
        const repoRoot = resolveRepoRoot(opts.repoRoot);
        const config = await loadOpsConfig(repoRoot);
        const provider = (opts.provider ?? config.default_provider ?? "github") as ProviderId;
        const ops = resolveOpsRoot(repoRoot);

        await withCollection(ops, async (collection) => {
          const kind = opts.issue ? "issue" : opts.pr ? "pr" : undefined;
          const number = opts.issue ? Number.parseInt(opts.issue, 10) : opts.pr ? Number.parseInt(opts.pr, 10) : undefined;

          const prepared = await prepareRun({
            collection,
            repoRoot,
            commandId: id,
            kind,
            number,
            repo: opts.repo ?? config.default_repo,
            provider,
            vars,
            ensureSidecar: false,
          });

          if (opts.format === "json") {
            console.log(JSON.stringify({
              command: prepared.command.frontmatter,
              missing: prepared.missingRequired,
              prompt: prepared.renderedPrompt,
              ...(opts.showContext ? { context: prepared.context } : {}),
            }, null, 2));
            return;
          }

          if (prepared.missingRequired.length > 0) {
            console.log(chalk.yellow(`missing vars: ${prepared.missingRequired.join(", ")}`));
          }

          if (opts.showContext) {
            console.log(chalk.bold("Context"));
            console.log(JSON.stringify(prepared.context, null, 2));
            console.log();
          }

          console.log(prepared.renderedPrompt);
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
