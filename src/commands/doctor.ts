import { Command } from "commander";
import chalk from "chalk";
import { resolveRepoRoot, resolveOpsRootMaybe } from "../lib/runtime.js";
import { openCollection } from "../lib/store.js";
import { execCapture } from "../lib/process.js";
import { loadOpsConfig } from "../lib/config.js";
import type { ProviderId } from "../lib/types.js";

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

function checkEnvPresent(name: string, label?: string): CheckResult {
  const value = process.env[name];
  const ok = typeof value === "string" && value.trim().length > 0;
  return {
    check: label ?? `${name} set`,
    ok,
    detail: ok ? "present" : `missing ${name}`,
  };
}

function checkAnyEnvPresent(names: string[], label: string): CheckResult {
  const ok = names.some((name) => {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0;
  });
  return {
    check: label,
    ok,
    detail: ok ? "present" : `missing one of: ${names.join(", ")}`,
  };
}

function checkAzureScope(defaultRepo?: string): CheckResult {
  if (defaultRepo && defaultRepo.trim().length > 0) {
    return {
      check: "azure scope",
      ok: true,
      detail: `from default_repo (${defaultRepo})`,
    };
  }

  const org = process.env.AZURE_ORG?.trim();
  const project = process.env.AZURE_PROJECT?.trim();
  if (org && project) {
    return {
      check: "azure scope",
      ok: true,
      detail: "from AZURE_ORG/AZURE_PROJECT",
    };
  }

  return {
    check: "azure scope",
    ok: false,
    detail: "set default_repo or AZURE_ORG/AZURE_PROJECT",
  };
}

async function providerChecks(provider: ProviderId, cwd: string, defaultRepo?: string): Promise<CheckResult[]> {
  if (provider === "github") {
    return [
      await checkCommandAvailable("gh", cwd),
      await checkGhAuth(cwd),
    ];
  }

  if (provider === "gitlab") {
    return [
      checkEnvPresent("GITLAB_TOKEN"),
      {
        check: "GITLAB_BASE_URL",
        ok: true,
        detail: process.env.GITLAB_BASE_URL?.trim() ? "custom base URL set" : "using https://gitlab.com",
      },
    ];
  }

  if (provider === "jira") {
    return [
      checkEnvPresent("JIRA_BASE_URL"),
      checkEnvPresent("JIRA_API_TOKEN"),
      checkAnyEnvPresent(["JIRA_EMAIL", "JIRA_USER"], "jira user identity"),
      {
        check: "jira project key",
        ok: true,
        detail: (defaultRepo && defaultRepo.trim())
          ? `from default_repo (${defaultRepo})`
          : (process.env.JIRA_PROJECT?.trim() ? "from JIRA_PROJECT" : "not set (optional; needed for KEY-123 style lookups)"),
      },
    ];
  }

  return [
    checkEnvPresent("AZURE_DEVOPS_PAT"),
    checkAzureScope(defaultRepo),
  ];
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
      const config = await loadOpsConfig(repoRoot);
      const provider = config.default_provider ?? "github";

      const [opsCheck, claudeCheck, codexCheck, ...providerSpecific] = await Promise.all([
        checkOpsCollection(ops),
        checkCommandAvailable("claude", repoRoot),
        checkCommandAvailable("codex", repoRoot),
        ...await providerChecks(provider, repoRoot, config.default_repo),
      ]);
      const checks = [opsCheck, ...providerSpecific, claudeCheck, codexCheck];

      const ok = checks.every((c) => c.ok);

      if (opts.format === "json") {
        console.log(JSON.stringify({ ok, provider, repo_root: repoRoot, ops_root: ops, checks }, null, 2));
        process.exit(ok ? 0 : 1);
      }

      console.log(chalk.bold("ops doctor"));
      console.log(chalk.dim(`repo: ${repoRoot}`));
      console.log(chalk.dim(`ops:  ${ops}`));
      console.log(chalk.dim(`provider: ${provider}`));
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
