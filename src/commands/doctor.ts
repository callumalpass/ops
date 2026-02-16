import { Command } from "commander";
import chalk from "chalk";
import { resolveRepoRoot, resolveOpsRootMaybe } from "../lib/runtime.js";
import { openCollection } from "../lib/store.js";
import { execCapture } from "../lib/process.js";

interface CheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

async function checkCommandAvailable(cmd: string, cwd: string): Promise<CheckResult> {
  try {
    const result = await execCapture(cmd, ["--help"], cwd);
    return {
      check: `${cmd} installed`,
      ok: result.exitCode === 0,
      detail: result.exitCode === 0 ? "ok" : (result.stderr || result.stdout || `exit ${result.exitCode}`).trim(),
    };
  } catch (error) {
    return {
      check: `${cmd} installed`,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkGhAuth(cwd: string): Promise<CheckResult> {
  try {
    const result = await execCapture("gh", ["auth", "status"], cwd);
    return {
      check: "gh auth",
      ok: result.exitCode === 0,
      detail: result.exitCode === 0 ? "authenticated" : (result.stderr || result.stdout || "not authenticated").trim(),
    };
  } catch (error) {
    return {
      check: "gh auth",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkOpsCollection(opsRoot: string): Promise<CheckResult> {
  try {
    const collection = await openCollection(opsRoot);
    const validation = await collection.validate();
    await collection.close();

    if (!validation.valid) {
      return {
        check: ".ops collection",
        ok: false,
        detail: `${validation.issues?.length ?? 0} validation issues`,
      };
    }

    return {
      check: ".ops collection",
      ok: true,
      detail: "valid",
    };
  } catch (error) {
    return {
      check: ".ops collection",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Validate local ops setup")
    .option("--repo-root <path>", "Repository root")
    .option("--format <format>", "text|json", "text")
    .action(async (opts) => {
      const repoRoot = resolveRepoRoot(opts.repoRoot);
      const ops = resolveOpsRootMaybe(repoRoot);

      const checks = await Promise.all([
        checkOpsCollection(ops),
        checkCommandAvailable("gh", repoRoot),
        checkGhAuth(repoRoot),
        checkCommandAvailable("claude", repoRoot),
        checkCommandAvailable("codex", repoRoot),
      ]);

      const ok = checks.every((c) => c.ok);

      if (opts.format === "json") {
        console.log(JSON.stringify({ ok, repo_root: repoRoot, ops_root: ops, checks }, null, 2));
        process.exit(ok ? 0 : 1);
      }

      console.log(chalk.bold("ops doctor"));
      console.log(chalk.dim(`repo: ${repoRoot}`));
      console.log(chalk.dim(`ops:  ${ops}`));
      console.log();

      for (const check of checks) {
        const icon = check.ok ? chalk.green("OK") : chalk.red("FAIL");
        console.log(`${icon} ${check.check}`);
        console.log(`  ${check.detail}`);
      }

      if (!ok) {
        process.exit(1);
      }
    });
}
