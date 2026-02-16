import { promises as fs } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { AgentCli, ApprovalPolicy, ProviderId, RunMode, SandboxMode } from "./types.js";

export interface OpsConfig {
  default_repo?: string;
  default_provider?: ProviderId;
  default_cli?: AgentCli;
  default_mode?: RunMode;
  default_model?: string;
  default_permission_mode?: string;
  default_allowed_tools?: string[];
  default_sandbox_mode?: SandboxMode;
  default_approval_policy?: ApprovalPolicy;
  commands: {
    triage_issue: string;
    address_issue: string;
    review_pr: string;
  };
}

const DEFAULT_CONFIG: OpsConfig = {
  commands: {
    triage_issue: "triage-issue",
    address_issue: "address-issue",
    review_pr: "review-pr",
  },
};

const CLI_VALUES = new Set<AgentCli>(["claude", "codex"]);
const PROVIDER_VALUES = new Set<ProviderId>(["github", "gitlab", "jira", "azure"]);
const MODE_VALUES = new Set<RunMode>(["interactive", "non-interactive"]);
const SANDBOX_VALUES = new Set<SandboxMode>(["read-only", "workspace-write", "danger-full-access"]);
const APPROVAL_VALUES = new Set<ApprovalPolicy>(["untrusted", "on-failure", "on-request", "never"]);

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid .ops/config.yaml field '${field}': expected non-empty string.`);
  }
  return value.trim();
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return asString(value, field);
}

function asEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: Set<T>,
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = asString(value, field) as T;
  if (!allowed.has(parsed)) {
    throw new Error(`Invalid .ops/config.yaml field '${field}': got '${parsed}'.`);
  }
  return parsed;
}

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Invalid .ops/config.yaml field '${field}': expected a list of strings.`);
  }
  const result = value.map((v, idx) => asString(v, `${field}[${idx}]`));
  return result.length > 0 ? result : undefined;
}

export function defaultOpsConfig(): OpsConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as OpsConfig;
}

export function configPath(repoRoot: string): string {
  return path.join(repoRoot, ".ops", "config.yaml");
}

export async function loadOpsConfig(repoRoot: string): Promise<OpsConfig> {
  const resolved = defaultOpsConfig();
  const filePath = configPath(repoRoot);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return resolved;
    }
    throw new Error(`Failed to read ${filePath}: ${err?.message ?? String(error)}`);
  }

  const parsedUnknown = yaml.load(raw) as unknown;
  if (parsedUnknown === undefined || parsedUnknown === null) {
    return resolved;
  }
  if (typeof parsedUnknown !== "object" || Array.isArray(parsedUnknown)) {
    throw new Error(`Invalid .ops/config.yaml: top-level value must be a mapping.`);
  }

  const parsed = parsedUnknown as Record<string, unknown>;

  resolved.default_repo = asOptionalString(parsed.default_repo, "default_repo");
  resolved.default_provider = asEnum(parsed.default_provider, "default_provider", PROVIDER_VALUES);
  resolved.default_cli = asEnum(parsed.default_cli, "default_cli", CLI_VALUES);
  resolved.default_mode = asEnum(parsed.default_mode, "default_mode", MODE_VALUES);
  resolved.default_model = asOptionalString(parsed.default_model, "default_model");
  resolved.default_permission_mode = asOptionalString(parsed.default_permission_mode, "default_permission_mode");
  resolved.default_allowed_tools = asStringArray(parsed.default_allowed_tools, "default_allowed_tools");
  resolved.default_sandbox_mode = asEnum(parsed.default_sandbox_mode, "default_sandbox_mode", SANDBOX_VALUES);
  resolved.default_approval_policy = asEnum(parsed.default_approval_policy, "default_approval_policy", APPROVAL_VALUES);

  if (parsed.commands !== undefined && parsed.commands !== null) {
    if (typeof parsed.commands !== "object" || Array.isArray(parsed.commands)) {
      throw new Error(`Invalid .ops/config.yaml field 'commands': expected a mapping.`);
    }
    const commandMap = parsed.commands as Record<string, unknown>;

    if (commandMap.triage_issue !== undefined) {
      resolved.commands.triage_issue = asString(commandMap.triage_issue, "commands.triage_issue");
    }
    if (commandMap.address_issue !== undefined) {
      resolved.commands.address_issue = asString(commandMap.address_issue, "commands.address_issue");
    }
    if (commandMap.review_pr !== undefined) {
      resolved.commands.review_pr = asString(commandMap.review_pr, "commands.review_pr");
    }
  }

  return resolved;
}
