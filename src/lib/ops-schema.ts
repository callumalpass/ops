import path from "node:path";
import { ensureDir, writeFileForce, writeFileIfMissing } from "./fs.js";

const MDBASE_YAML = `spec_version: "0.2.0"
settings:
  types_folder: "_types"
  default_validation: "error"
  default_strict: true
  include_subfolders: true
  rename_update_refs: true
`;

const OPS_CONFIG_YAML = `# Repository-level defaults for ops.
# Precedence: CLI flags > command frontmatter > this file > built-in defaults.
#
# default_repo: your-org/your-repo
# default_provider: github # github|gitlab|jira|azure
default_cli: claude
default_mode: interactive
# default_model: sonnet
# default_permission_mode: acceptEdits
# default_allowed_tools: ["Read", "Edit"]
# default_sandbox_mode: workspace-write
# default_approval_policy: on-request

commands:
  triage_issue: triage-issue
  address_issue: address-issue
  review_pr: review-pr
  triage_task: triage-task
  address_task: address-task
`;

const COMMAND_TYPE = `---
name: command
strict: true
fields:
  id:
    type: string
    required: true
    unique: true
    pattern: "^[a-z0-9-]+$"
  name:
    type: string
    required: true
  scope:
    type: enum
    required: true
    values: [issue, pr, task, general]
  description:
    type: string
  placeholders:
    type: list
    items:
      type: string
  cli_type:
    type: enum
    values: [claude, codex]
  active:
    type: boolean
    default: true
  default_mode:
    type: enum
    values: [interactive, non-interactive]
  model:
    type: string
  permission_mode:
    type: string
  allowed_tools:
    type: list
    items:
      type: string
  sandbox_mode:
    type: enum
    values: [read-only, workspace-write, danger-full-access]
  approval_policy:
    type: enum
    values: [untrusted, on-failure, on-request, never]
---

# Command Type

Defines a reusable command template. The markdown body contains the prompt
template with \`{{placeholder}}\` variables that are expanded at runtime from
provider data, sidecar fields, and explicit \`--var\` flags.

## Fields

### id (string, required, unique)

Kebab-case identifier for the command. Must match \`^[a-z0-9-]+$\`.
Used to invoke the command via \`ops run <id>\` and referenced in config.yaml
command mappings.

### name (string, required)

Human-readable display name shown in \`ops command list\` output.

### scope (enum, required)

What kind of work item this command targets. Determines which context
variables are available during template expansion.

- **issue** — targets issues; provides issue-specific placeholders like
  \`{{body}}\`, \`{{labels_csv}}\`.
- **pr** — targets pull requests; provides PR-specific placeholders like
  \`{{head_ref}}\`, \`{{base_ref}}\`.
- **task** — targets local task records; provides task placeholders like
  \`{{source_path}}\`, \`{{state}}\`.
- **general** — not scoped to a specific item type; only explicit
  \`--var\` values and sidecar fields are available.

### description (string)

Short summary of what the command does. Shown in \`ops command list\` and
used as context when agents select commands.

### placeholders (list of string)

Declares the template variables used in the markdown body. Each entry is
a variable name (without braces). Variables are expanded from context at
runtime; missing variables use their \`{{name|fallback}}\` default or are
left unexpanded.

### cli_type (enum)

Which agent CLI to invoke when running this command.

- **claude** — use the Claude Code CLI.
- **codex** — use the OpenAI Codex CLI.

Defaults to the value of \`default_cli\` in config.yaml.

### active (boolean, default: true)

Whether this command appears in listings and is available for execution.
Set to \`false\` to disable a command without deleting it.

### default_mode (enum)

How the agent session runs by default. Can be overridden per-invocation
with \`--interactive\` or \`--non-interactive\`.

- **interactive** — the agent runs with a live terminal session.
- **non-interactive** — the agent runs headlessly and streams output.

### model (string)

Model identifier to pass to the agent CLI (e.g. \`sonnet\`, \`opus\`).
Overrides config.yaml \`default_model\`. Omit to use the CLI default.

### permission_mode (string)

Permission mode to pass to the agent CLI (e.g. \`default\`, \`acceptEdits\`,
\`bypassPermissions\`). Overrides config.yaml \`default_permission_mode\`.

### allowed_tools (list of string)

Explicit list of tool names the agent is allowed to use (e.g.
\`["Read", "Edit", "Bash"]\`). Overrides config.yaml \`default_allowed_tools\`.

### sandbox_mode (enum)

Filesystem sandbox policy for the agent session.

- **read-only** — agent can read but not write any files.
- **workspace-write** — agent can write within the workspace.
- **danger-full-access** — no filesystem restrictions.

Overrides config.yaml \`default_sandbox_mode\`.

### approval_policy (enum)

When the agent must pause for human approval.

- **untrusted** — every action requires approval.
- **on-failure** — approval required only after errors.
- **on-request** — agent can request approval when uncertain.
- **never** — fully autonomous execution.

Overrides config.yaml \`default_approval_policy\`.
`;

const ITEM_STATE_TYPE = `---
name: item_state
strict: true
fields:
  id:
    type: string
    required: true
    unique: true
  provider:
    type: enum
    required: true
    values: [github, gitlab, jira, azure, local]
  key:
    type: string
    required: true
  external_ref:
    type: string
    required: true
  target_path:
    type: string
  repo:
    type: string
  kind:
    type: enum
    required: true
    values: [issue, pr, task]
  number:
    type: integer
  remote_state:
    type: string
  remote_title:
    type: string
  remote_author:
    type: string
  remote_url:
    type: string
  remote_updated_at:
    type: datetime
  last_seen_remote_updated_at:
    type: datetime
  local_status:
    type: enum
    values: [new, triaged, in_progress, blocked, done, wontfix]
    default: new
  priority:
    type: enum
    values: [low, medium, high, critical]
  difficulty:
    type: enum
    values: [trivial, easy, medium, hard, complex]
  risk:
    type: enum
    values: [low, medium, high]
  owner:
    type: string
  tags:
    type: list
    items:
      type: string
  summary:
    type: string
  notes:
    type: string
  command_id:
    type: string
  sync_state:
    type: enum
    values: [clean, dirty, conflict]
    default: clean
  last_analyzed_at:
    type: datetime
---

# Item State Type

Sidecar state for a tracked issue, pull request, or local task. Each item lives at
\`items/*.md\`. Remote fields are populated by \`ops item ensure\` from providers,
while local task fields are populated from task markdown records.

The markdown body is free-form and intended for detailed analysis,
reasoning, and handover context that doesn't fit in structured fields.

## Remote Fields

These fields are populated automatically from the provider (GitHub, GitLab,
Jira, Azure DevOps) when running \`ops item ensure\`. They should not
normally be edited by hand.

### id (string, required, unique)

Canonical identifier in the format \`provider:owner/repo:kind:number\`
(e.g. \`github:acme/app:issue:42\`). Generated automatically.

### repo (string, required)

Repository slug in \`owner/repo\` format.

### kind (enum, required)

- **issue** — this sidecar tracks an issue.
- **pr** — this sidecar tracks a pull request.
- **task** — this sidecar tracks a local task.

### number (integer, required)

The issue or PR number from the remote provider.

### remote_state (string)

Current state on the remote provider (e.g. \`open\`, \`closed\`, \`merged\`).
Updated on each \`ops item ensure\` or sync.

### remote_title (string)

Title of the issue or PR as it appears on the remote provider.

### remote_author (string)

Username of the original author on the remote provider.

### remote_url (string)

Direct URL to the issue or PR on the remote provider.

### remote_updated_at (datetime)

Timestamp of the most recent update on the remote provider, as reported
by the provider API.

### last_seen_remote_updated_at (datetime)

The value of \`remote_updated_at\` from the previous sync. Used to detect
whether the remote has changed since the last time ops fetched data.

## Local Fields

These fields are managed locally by agents and operators. They represent
the local assessment and workflow state, independent of the remote provider.

### local_status (enum, default: new)

Current workflow status of this item.

- **new** — just synced, not yet reviewed.
- **triaged** — reviewed and assessed but work has not started.
- **in_progress** — actively being worked on.
- **blocked** — work is stalled on a dependency or question.
- **done** — work is complete.
- **wontfix** — intentionally declined or deferred indefinitely.

### priority (enum)

Urgency assessment.

- **low** — address when convenient.
- **medium** — should be handled in the current cycle.
- **high** — needs prompt attention.
- **critical** — drop everything and fix immediately.

### difficulty (enum)

Estimated implementation complexity.

- **trivial** — a few minutes, minimal risk.
- **easy** — straightforward, well-understood change.
- **medium** — moderate effort, some unknowns.
- **hard** — significant effort or tricky edge cases.
- **complex** — large scope, cross-cutting, or high uncertainty.

### risk (enum)

Assessed risk of the change or issue.

- **low** — unlikely to cause regressions or side effects.
- **medium** — some potential for issues, review carefully.
- **high** — significant chance of breakage, needs thorough testing.

### owner (string)

Who is responsible for this item. Can be a human username or agent
identifier.

### tags (list of string)

Free-form labels for categorization and filtering (e.g.
\`["bug", "frontend", "auth"]\`).

### summary (string)

Concise description of the item's current state or the outcome of
analysis. Typically written or updated by triage/address commands.

### notes (string)

Additional context, decisions, caveats, or follow-up items. Used for
information that doesn't fit in \`summary\` but should be preserved in
frontmatter for quick reference.

### command_id (string)

The \`id\` of the last command that was run against this item (e.g.
\`triage-issue\`, \`address-issue\`). Useful for tracking workflow history.

### sync_state (enum, default: clean)

Tracks whether local state is consistent with what was last fetched.

- **clean** — local state matches or has been intentionally updated
  since the last sync.
- **dirty** — local changes have been made that haven't been reconciled.
- **conflict** — both local and remote have changed since the last sync.

### last_analyzed_at (datetime)

ISO 8601 timestamp of when this item was last analyzed or updated by a
command. Set by agents after triage, review, or address operations.
`;

const TASK_TYPE = `---
name: task
description: Local task record tracked by ops workflows.
display_name_key: title
strict: false

path_pattern: "tasks/{title}.md"

match:
  path_glob: "tasks/**/*.md"

fields:
  title:
    type: string
    required: true
  status:
    type: enum
    values: [open, in-progress, done, cancelled]
    default: open
  priority:
    type: enum
    values: [low, normal, high, urgent]
    default: normal
  owner:
    type: string
  tags:
    type: list
    items:
      type: string
  dateCreated:
    type: datetime
    generated: "now"
  dateModified:
    type: datetime
    generated: "now_on_write"
---

# Task Type

Local tasks for agent workflows. These are source work items; ops creates
separate \`item_state\` sidecars in \`items/*.md\` for operational metadata.
`;

const HANDOFF_TYPE = `---
name: handoff
strict: true
fields:
  id:
    type: string
    required: true
    unique: true
  item_id:
    type: string
    required: true
  for_agent:
    type: string
    required: true
  status:
    type: enum
    values: [open, acknowledged, completed, closed]
    default: open
  next_steps:
    type: list
    items:
      type: string
  blockers:
    type: list
    items:
      type: string
  created_by:
    type: string
  created_at:
    type: datetime
---

# Handoff Type

A structured handoff record for transferring context between agents or
between an agent and a human. Handoffs live at \`handoffs/{id}.md\` and
are created via \`ops handoff create\`.

The markdown body is free-form and can contain additional context,
reasoning, or detailed notes beyond what fits in the structured fields.

## Fields

### id (string, required, unique)

Unique identifier for the handoff, typically auto-generated with a
timestamp component (e.g. \`handoff-2024-01-15T10-30-00\`).

### item_id (string, required)

The \`id\` of the item this handoff relates to (e.g.
\`github:acme/app:issue:42\`). Links the handoff back to the relevant
issue or PR sidecar.

### for_agent (string, required)

Identifier of the intended recipient — the agent or human who should
pick up this work next.

### status (enum, default: open)

Lifecycle state of the handoff.

- **open** — waiting to be picked up by the target agent/human.
- **acknowledged** — the recipient has seen the handoff.
- **completed** — the recipient has finished the requested work.
- **closed** — the handoff has been resolved or is no longer relevant.

### next_steps (list of string)

Ordered list of concrete actions the recipient should take. Keep each
entry short and actionable (e.g. \`"Run the failing test suite"\`,
\`"Review the auth middleware changes"\`).

### blockers (list of string)

Known issues or dependencies preventing progress. Each entry should
describe what is blocked and why (e.g.
\`"Waiting on API credentials from infra team"\`).

### created_by (string)

Identifier of the agent or human who created this handoff.

### created_at (datetime)

ISO 8601 timestamp of when the handoff was created.
`;

const TRIAGE_ISSUE_COMMAND = `---
type: command
id: triage-issue
name: Triage Issue
scope: issue
description: Analyze and triage an issue with local sidecar updates
placeholders: [item_ref, title, author, body, labels_csv, sidecar_path, ops_item_abs_path]
cli_type: claude
active: true
default_mode: interactive
---
Analyze issue {{item_ref}}.

Title: {{title}}
Author: {{author}}
Labels: {{labels_csv|none}}

Body:
{{body|No body provided.}}

Update the sidecar file for this item:
- relative path: {{sidecar_path|items/issue-<number>.md}}
- absolute path: {{ops_item_abs_path|<repo>/.ops/items/...}}

In that file, set/update:
- local_status
- priority (low|medium|high|critical)
- difficulty (trivial|easy|medium|hard|complex)
- risk (low|medium|high)
- summary
- notes
- command_id (set to "triage-issue")
- last_analyzed_at (ISO timestamp)
- sync_state (set to "clean" unless there is a conflict)

In your triage write-up:
- Include a root cause analysis in summary and/or notes.
- Include suggested fixes (preferred approach and at least one fallback option).

You can update these fields by editing the markdown sidecar directly or using:
- ops item set --issue {{number}} --field local_status=... --field priority=... --field difficulty=... --field risk=...
`;

const REVIEW_PR_COMMAND = `---
type: command
id: review-pr
name: Review PR
scope: pr
description: Review a pull request and summarize risks
placeholders: [item_ref, title, author, body, head_ref, base_ref, sidecar_path, ops_item_abs_path]
cli_type: claude
active: true
default_mode: interactive
---
Review pull request {{item_ref}}.

Title: {{title}}
Author: {{author}}
Branch: {{head_ref|unknown}} -> {{base_ref|unknown}}

Description:
{{body|No description provided.}}

Update the sidecar file for this PR:
- relative path: {{sidecar_path|items/pr-<number>.md}}
- absolute path: {{ops_item_abs_path|<repo>/.ops/items/...}}

In that file, set/update:
- local_status
- risk (low|medium|high)
- summary
- notes
- command_id (set to "review-pr")
- last_analyzed_at (ISO timestamp)
- sync_state (set to "clean" unless there is a conflict)

You can update these fields by editing the markdown sidecar directly or using:
- ops item set --pr {{number}} --field local_status=... --field risk=...

Use notes to capture:
1. Main changes
2. Risks and regressions
3. Missing tests
4. Merge recommendation
`;

const ADDRESS_ISSUE_COMMAND = `---
type: command
id: address-issue
name: Address Issue
scope: issue
description: Implement a solution for an issue using existing triage analysis
placeholders: [item_ref, title, author, body, priority, difficulty, risk, summary, notes, sidecar_body, sidecar_path, ops_item_abs_path]
cli_type: claude
active: true
default_mode: interactive
---
Address issue {{item_ref}}.

Title: {{title}}
Author: {{author}}
Priority: {{priority|not set}}
Difficulty: {{difficulty|not set}}
Risk: {{risk|not set}}

Triage summary:
{{summary|No summary yet.}}

Triage notes:
{{notes|No notes yet.}}

Sidecar markdown body context:
{{sidecar_body|No additional sidecar body context.}}

Issue body:
{{body|No issue body provided.}}

Before coding:
1. Read the sidecar file at {{sidecar_path|items/issue-<number>.md}} ({{ops_item_abs_path|<repo>/.ops/items/...}}).
2. Confirm or refine the approach based on current code state.
3. Implement the fix with appropriate tests.

After coding, update the sidecar with current status and outcomes.
You can update via direct markdown edit or with:
- ops item set --issue {{number}} --field local_status=... --field summary=... --field difficulty=...

Set/update:
- local_status (in_progress, blocked, done, etc.)
- summary (what was done)
- notes (decisions, caveats, follow-ups)
- command_id (set to "address-issue")
- last_analyzed_at (ISO timestamp)
- sync_state (clean unless conflict)
`;

const TRIAGE_TASK_COMMAND = `---
type: command
id: triage-task
name: Triage Task
scope: task
description: Analyze and triage a local task with sidecar updates
placeholders: [item_ref, title, state, body, source_path, sidecar_path, ops_item_abs_path]
cli_type: claude
active: true
default_mode: interactive
---
Analyze task {{item_ref}}.

Title: {{title}}
Current status: {{state|unknown}}
Task path: {{source_path|tasks/<task>.md}}

Task body:
{{body|No task body provided.}}

Update the sidecar file for this task:
- relative path: {{sidecar_path|items/task-<key>.md}}
- absolute path: {{ops_item_abs_path|<repo>/.ops/items/...}}

Set/update:
- local_status
- priority (low|medium|high|critical)
- difficulty (trivial|easy|medium|hard|complex)
- risk (low|medium|high)
- summary
- notes
- command_id (set to "triage-task")
- last_analyzed_at (ISO timestamp)
- sync_state (set to "clean" unless there is a conflict)

You can update via direct markdown edit or:
- ops item set --task {{source_path}} --field local_status=... --field priority=... --field difficulty=... --field risk=...
`;

const ADDRESS_TASK_COMMAND = `---
type: command
id: address-task
name: Address Task
scope: task
description: Execute a local task using existing triage analysis
placeholders: [item_ref, title, state, priority, difficulty, risk, summary, notes, body, source_path, sidecar_path, ops_item_abs_path]
cli_type: claude
active: true
default_mode: interactive
---
Address task {{item_ref}}.

Title: {{title}}
Current status: {{state|unknown}}
Priority: {{priority|not set}}
Difficulty: {{difficulty|not set}}
Risk: {{risk|not set}}
Task path: {{source_path|tasks/<task>.md}}

Triage summary:
{{summary|No summary yet.}}

Triage notes:
{{notes|No notes yet.}}

Task body:
{{body|No task body provided.}}

Before coding:
1. Read the task file at {{source_path|tasks/<task>.md}}.
2. Read the sidecar at {{sidecar_path|items/task-<key>.md}} ({{ops_item_abs_path|<repo>/.ops/items/...}}).
3. Confirm and execute the work plan.

After coding, update sidecar status and outcomes.
You can update via direct markdown edit or:
- ops item set --task {{source_path}} --field local_status=... --field summary=... --field notes=...

Set/update:
- local_status (in_progress, blocked, done, etc.)
- summary (what was done)
- notes (decisions, caveats, follow-ups)
- command_id (set to "address-task")
- last_analyzed_at (ISO timestamp)
- sync_state (clean unless conflict)
`;

const HANDOFF_COMMAND = `---
type: command
id: handoff
name: Create Handoff
scope: general
description: Prepare a concise handoff for another agent or human
placeholders: [item_ref, title, summary, notes]
cli_type: claude
active: true
default_mode: non-interactive
---
Create a handoff for {{item_ref|this work item}}.

Title: {{title|No title}}
Summary: {{summary|No summary yet}}
Current notes:
{{notes|No notes yet}}

Output concise:
- Context
- Open questions
- Next 3 actions
`;

const README = `# .ops

This folder contains repo-local operational state for AI-assisted workflows.

## What lives here

- \`commands/*.md\`: markdown command templates with typed frontmatter
- \`items/*.md\`: sidecar state for issues, PRs, and tasks
- \`tasks/*.md\`: local task records
- \`handoffs/*.md\`: structured handoff records
- \`_types/*.md\`: mdbase type definitions for validation

## Basic usage

Run all commands from the repository root:

\`\`\`bash
ops doctor
ops command list
ops item ensure --issue 123
ops run triage-issue --issue 123
ops run address-issue --issue 123
ops issue address --issue 123
ops item ensure --task tasks/Ship release train.md
ops run triage-task --task tasks/Ship release train.md
ops run address-task --task tasks/Ship release train.md
\`\`\`

## Repo defaults

Use \`config.yaml\` in this folder to set repository defaults for:

- default agent CLI/model/mode
- default provider and provider scope
- default command IDs for triage/address/review flows

CLI flags still override both command frontmatter and \`config.yaml\`.

Useful variants:

\`\`\`bash
ops run review-pr --pr 456 --interactive
ops run triage-issue --issue 123 --non-interactive
ops run address-issue --issue 123 --interactive
ops issue address --issue 123
ops run triage-task --task tasks/Ship release train.md --interactive
ops run address-task --task tasks/Ship release train.md --interactive
ops command render triage-issue --issue 123
ops item set --issue 123 --field local_status=in_progress
ops item set --issue 123 --field priority=high --field difficulty=medium --field risk=medium
ops item set --task tasks/Ship release train.md --field local_status=in_progress --field priority=high
\`\`\`

## How commands work

- Templates use placeholders like \`{{title}}\` or \`{{title|fallback}}\`.
- Context comes from:
  - explicit \`--var key=value\`
  - live provider data (for example GitHub/GitLab/Jira/Azure) when \`--issue\` or \`--pr\` is provided
  - local task data when \`--task\` is provided
  - existing sidecar fields in \`items/*.md\`
- Commands typically ask agents to keep sidecar files updated as part of the workflow.

## Guidance for AI agents

When working on work items through this repo:

1. Ensure sidecar exists and is up to date:
   - \`ops item ensure --issue <n>\`
   - \`ops item ensure --pr <n>\`
   - \`ops item ensure --task <path-or-title>\`
2. Run an appropriate command template:
   - \`ops run triage-issue --issue <n>\`
   - \`ops run address-issue --issue <n>\`
   - \`ops run review-pr --pr <n>\`
   - \`ops run triage-task --task <path-or-title>\`
   - \`ops run address-task --task <path-or-title>\`
3. If the command asks for sidecar updates, use either approach:
   - edit \`.ops/items/*.md\` directly
   - or use \`ops item set\` for structured frontmatter updates
4. Example structured updates:
   - \`ops item set --issue <n> --field local_status=in_progress --field priority=high --field difficulty=medium\`
5. Keep frontmatter concise and structured (\`local_status\`, \`priority\`, \`difficulty\`, \`risk\`, \`summary\`, \`notes\`).
6. Prefer writing detailed analysis in the markdown body of \`.ops/items/*.md\`.
   Use frontmatter for queryable status/metadata, body for richer reasoning and handover context.
7. Use handoffs for continuity:
   - \`ops handoff create --issue <n> --for-agent <name>\`

## Notes

- This folder is intended to be committed to git.
- Run \`ops command validate\` if command templates look broken.
- Run \`ops init --force\` to refresh starter files from the current CLI version.
`;

export async function scaffoldOps(opsRoot: string, force: boolean): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];

  const files: Array<{ path: string; content: string }> = [
    { path: "mdbase.yaml", content: MDBASE_YAML },
    { path: "config.yaml", content: OPS_CONFIG_YAML },
    { path: "README.md", content: README },
    { path: "_types/command.md", content: COMMAND_TYPE },
    { path: "_types/item_state.md", content: ITEM_STATE_TYPE },
    { path: "_types/task.md", content: TASK_TYPE },
    { path: "_types/handoff.md", content: HANDOFF_TYPE },
    { path: "commands/triage-issue.md", content: TRIAGE_ISSUE_COMMAND },
    { path: "commands/review-pr.md", content: REVIEW_PR_COMMAND },
    { path: "commands/address-issue.md", content: ADDRESS_ISSUE_COMMAND },
    { path: "commands/triage-task.md", content: TRIAGE_TASK_COMMAND },
    { path: "commands/address-task.md", content: ADDRESS_TASK_COMMAND },
    { path: "commands/handoff.md", content: HANDOFF_COMMAND },
  ];

  await ensureDir(opsRoot);
  await ensureDir(path.join(opsRoot, "items"));
  await ensureDir(path.join(opsRoot, "tasks"));
  await ensureDir(path.join(opsRoot, "handoffs"));

  for (const file of files) {
    const full = path.join(opsRoot, file.path);
    if (force) {
      await writeFileForce(full, file.content);
      created.push(file.path);
      continue;
    }
    const wrote = await writeFileIfMissing(full, file.content);
    if (wrote) created.push(file.path);
    else skipped.push(file.path);
  }

  return { created, skipped };
}
