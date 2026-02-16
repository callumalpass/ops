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
    values: [issue, pr, general]
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
`;

const ITEM_STATE_TYPE = `---
name: item_state
strict: true
fields:
  id:
    type: string
    required: true
    unique: true
  repo:
    type: string
    required: true
  kind:
    type: enum
    required: true
    values: [issue, pr]
  number:
    type: integer
    required: true
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
- \`items/*.md\`: issue/PR sidecar state
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
\`\`\`

Useful variants:

\`\`\`bash
ops run review-pr --pr 456 --interactive
ops run triage-issue --issue 123 --non-interactive
ops run address-issue --issue 123 --interactive
ops command render triage-issue --issue 123
ops item set --issue 123 --field local_status=in_progress
ops item set --issue 123 --field priority=high --field difficulty=medium --field risk=medium
\`\`\`

## How commands work

- Templates use placeholders like \`{{title}}\` or \`{{title|fallback}}\`.
- Context comes from:
  - explicit \`--var key=value\`
  - live GitHub data (\`gh issue/pr view\`) when \`--issue\` or \`--pr\` is provided
  - existing sidecar fields in \`items/*.md\`
- Commands typically ask agents to keep sidecar files updated as part of the workflow.

## Guidance for AI agents

When working on issues/PRs through this repo:

1. Ensure sidecar exists and is up to date:
   - \`ops item ensure --issue <n>\` or \`ops item ensure --pr <n>\`
2. Run an appropriate command template:
   - \`ops run triage-issue --issue <n>\`
   - \`ops run address-issue --issue <n>\`
   - \`ops run review-pr --pr <n>\`
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
    { path: ".gitignore", content: ".lock\n" },
    { path: "mdbase.yaml", content: MDBASE_YAML },
    { path: "README.md", content: README },
    { path: "_types/command.md", content: COMMAND_TYPE },
    { path: "_types/item_state.md", content: ITEM_STATE_TYPE },
    { path: "_types/handoff.md", content: HANDOFF_TYPE },
    { path: "commands/triage-issue.md", content: TRIAGE_ISSUE_COMMAND },
    { path: "commands/review-pr.md", content: REVIEW_PR_COMMAND },
    { path: "commands/address-issue.md", content: ADDRESS_ISSUE_COMMAND },
    { path: "commands/handoff.md", content: HANDOFF_COMMAND },
  ];

  await ensureDir(opsRoot);
  await ensureDir(path.join(opsRoot, "items"));
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
