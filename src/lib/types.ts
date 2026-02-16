export type AgentCli = "claude" | "codex";
export type RunMode = "interactive" | "non-interactive";
export type ItemKind = "issue" | "pr";

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type ApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";

export interface CommandRecord {
  path: string;
  body: string;
  frontmatter: {
    id: string;
    name: string;
    scope: "issue" | "pr" | "general";
    description?: string;
    placeholders?: string[];
    cli_type?: AgentCli;
    active?: boolean;
    default_mode?: RunMode;
    model?: string;
    permission_mode?: string;
    allowed_tools?: string[];
    sandbox_mode?: SandboxMode;
    approval_policy?: ApprovalPolicy;
  };
}

export interface GitHubLabel {
  name: string;
}

export interface GitHubUser {
  login: string;
}

export interface GitHubItem {
  kind: ItemKind;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  state: string;
  url: string;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  updatedAt: string;
  headRefName?: string;
  baseRefName?: string;
}

export interface RenderResult {
  text: string;
  missingRequired: string[];
  placeholdersUsed: string[];
}

export interface AgentRunInput {
  cli: AgentCli;
  mode: RunMode;
  prompt: string;
  cwd: string;
  model?: string;
  permissionMode?: string;
  allowedTools?: string[];
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
}

export interface AgentRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
