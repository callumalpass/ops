export type AgentCli = "claude" | "codex";
export type RunMode = "interactive" | "non-interactive";
export type ItemKind = "issue" | "pr" | "task";
export type ProviderId = "github" | "gitlab" | "jira" | "azure";
export type ItemProviderId = ProviderId | "local";
export type RemoteKind = Exclude<ItemKind, "task">;

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type ApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";

export interface CommandRecord {
  path: string;
  body: string;
  frontmatter: {
    id: string;
    name: string;
    scope: "issue" | "pr" | "task" | "general";
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

export interface RemoteLabel {
  name: string;
}

export interface RemoteUser {
  login: string;
}

export interface RemoteItem {
  provider?: ItemProviderId;
  kind: ItemKind;
  key?: string;
  repo?: string;
  number?: number;
  title: string;
  body: string;
  author?: string;
  state?: string;
  url?: string;
  labels: RemoteLabel[];
  assignees: RemoteUser[];
  updatedAt: string;
  headRefName?: string;
  baseRefName?: string;
  sourcePath?: string;
}

// Backwards-compatible aliases while provider abstraction is phased in.
export type GitHubLabel = RemoteLabel;
export type GitHubUser = RemoteUser;
export type GitHubItem = RemoteItem;

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
