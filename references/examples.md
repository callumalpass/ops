# Examples

Use these examples as canonical shapes when creating records manually.

## Derive A Local Task Sidecar Path

```bash
scripts/derive_item_sidecar_path.py task 'tasks/Add end-to-end smoke suite for core ops commands.md'
```

Expected output:

```text
items/task-tasks-add-end-to-end-smoke-suite-for-core-ops-commands-m-2d7c409f.md
```

## Scaffold A Local Task Item Sidecar

```bash
scripts/scaffold_item_sidecar.py \
  --provider local \
  --kind task \
  --external-ref 'tasks/Add end-to-end smoke suite for core ops commands.md' \
  --local-status triaged \
  --priority high \
  --risk medium \
  --summary 'Add smoke coverage for the default `ops` command flow.' \
  --analysis 'The current suite does not exercise the end-to-end happy path.' \
  --plan 'Cover init, doctor, run, and triage; fail on regressions in default configuration.'
```

If you want the helper to write the file directly into a registry:

```bash
scripts/scaffold_item_sidecar.py \
  --provider local \
  --kind task \
  --external-ref 'tasks/Add end-to-end smoke suite for core ops commands.md' \
  --write-root .ops
```

## List Missing GitHub Item Sidecars

```bash
scripts/gh_list_missing_items.py \
  --repo acme/api \
  --ops-root .ops \
  --kind all
```

For offline testing, provide fixture data instead of calling `gh`:

```bash
scripts/gh_list_missing_items.py \
  --repo acme/api \
  --ops-root .ops \
  --from-json /tmp/gh-items.json
```

The fixture file should look like:

```json
{
  "issues": [
    {
      "number": 42,
      "title": "Fix pagination regression in audit log",
      "url": "https://github.com/acme/api/issues/42",
      "author": { "login": "octocat" },
      "state": "OPEN",
      "updatedAt": "2026-03-08T09:15:00Z"
    }
  ],
  "prs": [
    {
      "number": 43,
      "title": "feat: add grouped audit summaries",
      "url": "https://github.com/acme/api/pull/43",
      "author": { "login": "octocat" },
      "state": "OPEN",
      "updatedAt": "2026-03-08T10:00:00Z"
    }
  ]
}
```

## Seed Missing GitHub Item Sidecars

```bash
scripts/gh_seed_missing_items.py \
  --repo acme/api \
  --ops-root .ops \
  --kind all
```

That is a dry run. Re-run with `--write` to create minimal `local_status: new`
sidecars under `.ops/items/`.

## Local Task Item Sidecar

```markdown
---
id: local:task:tasks/Add end-to-end smoke suite for core ops commands.md
provider: local
kind: task
key: tasks/Add end-to-end smoke suite for core ops commands.md
external_ref: tasks/Add end-to-end smoke suite for core ops commands.md
target_path: tasks/Add end-to-end smoke suite for core ops commands.md
remote_title: Add end-to-end smoke suite for core ops commands
remote_state: open
remote_url: tasks/Add end-to-end smoke suite for core ops commands.md
remote_updated_at: 2026-02-19T11:51:37.443Z
last_seen_remote_updated_at: 2026-02-19T11:51:37.443Z
local_status: triaged
priority: high
risk: medium
sync_state: clean
type: item_state
---

## Summary
Add smoke coverage for the default `ops` command flow.

## Analysis
The current suite does not exercise the end-to-end happy path.

## Plan
1. Cover `init`, `doctor`, `run`, and `triage`.
2. Fail on regressions in default configuration.

## Notes
Keep the sidecar aligned with the task file when status or timestamps change.
```

## Remote Issue Item Sidecar

```markdown
---
id: github:issue:https://github.com/acme/api/issues/42
provider: github
kind: issue
key: 42
repo: acme/api
number: 42
external_ref: https://github.com/acme/api/issues/42
remote_title: Fix pagination regression in audit log
remote_state: open
remote_author: octocat
remote_url: https://github.com/acme/api/issues/42
remote_updated_at: 2026-03-08T09:15:00Z
last_seen_remote_updated_at: 2026-03-08T09:15:00Z
local_status: in_progress
priority: critical
difficulty: medium
risk: high
sync_state: clean
type: item_state
---

## Summary
The audit log stops after the first page when a filter is applied.

## Analysis
The bug appears in the cursor encoding path added last week.

## Plan
1. Reproduce against the failing filter combination.
2. Patch the cursor encoder and add a regression test.
```

## Handoff

```markdown
---
id: handoff-audit-log-pagination
item_id: github:issue:https://github.com/acme/api/issues/42
for_agent: codex
status: open
next_step: Reproduce the cursor bug in a local integration test.
created_by: codex
created_at: 2026-03-09T00:00:00Z
type: handoff
---

## Context
The likely fault is in the cursor encoder used only by filtered audit-log queries.

## Blockers
I did not finish a local repro before handing off.

## Open Questions
Does the bug also affect descending sort order?
```
