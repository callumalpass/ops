---
name: ops-registry
description: Maintain a repo-local `.ops/` registry backed by `mdbase` that gives agents and humans durable shared memory about delivery work. Use when initializing or updating `.ops/`, creating or maintaining issue/PR/task sidecars in that registry, recording analysis/plans/handoffs there, or safely migrating an existing `.ops/` layout without losing local state.
---

# Ops Registry

Maintain `.ops/` as a markdown-native registry of delivery work.

In this context, "ops" means the operational state around delivery work:

- what the work item is
- how urgent or risky it is
- what we currently think about it
- what should happen next
- what another agent or person would need to pick it up

The registry is schema-driven with `mdbase`. The point of the skill is to keep
that operational state durable, local to the repo, and easy to inspect in plain
markdown.

Here, `mdbase` means a markdown collection identified by `mdbase.yaml`, with
type definitions in `_types/` and markdown records treated as typed, queryable
data.

`ops` is a domain-specific `mdbase` collection for delivery work.

## Use This Skill For

- initializing `.ops/` in a repo
- creating or updating sidecars for issues, PRs, or local tasks
- triaging work and recording priority, difficulty, risk, and status
- writing analysis, plans, decisions, and running notes
- creating handoffs so later sessions can continue from local state instead of
  starting over

## What The Registry Should Achieve

The `.ops/` registry should act as shared working memory for the repo.

It should let an agent or human answer:

- What items are active?
- Which ones matter most?
- What is the current understanding of each item?
- What is the plan?
- What is blocked?
- What should happen next?

## Canonical Template

Treat `assets/ops-registry-template/.ops/` as canonical.

When asked to initialize or repair `.ops/` in another repo:

1. Create `.ops/` if missing.
2. Copy missing files from `assets/ops-registry-template/.ops/`.
3. Do not overwrite existing `items/`, `tasks/`, or `handoffs/` records unless the user explicitly asks.
4. Do not overwrite existing schema files blindly. If `_types/` or `mdbase.yaml` already exist, inspect the diff, preserve repo-specific customizations, and explain any migration you make.
5. Do not invent alternate schemas unless the user asks.
6. Keep the registry markdown-first. Use bundled helper scripts from this skill when they remove ambiguity, but do not require extra tooling in the target repo unless the user asks for it.

## Registry Layout

The canonical registry contains:

- `.ops/mdbase.yaml`
- `.ops/_types/item_state.md`
- `.ops/_types/task.md`
- `.ops/_types/handoff.md`
- `.ops/items/`
- `.ops/tasks/`
- `.ops/handoffs/`

## Working Model

Use the registry as a split between queryable state and narrative context.

- Frontmatter is for compact fields you may want to filter, sort, or validate.
- The markdown body is for reasoning, plans, decisions, and handoff context.

## Optional Tooling

This workflow can be maintained entirely by editing markdown files.

If `mdbase-cli` is available, use it as a helper for inspection and validation.
Typical checks are:

- run commands from inside the target `.ops/` directory
- `mdbase --help`
- `mdbase validate .`
- `mdbase query 'local_status == "new"' --types item_state .`
- `mdbase read items/<sidecar>.md .`

If you are at the repo root, change into `.ops/` before running the commands:

```bash
cd .ops
mdbase validate .
mdbase query 'local_status == "new"' --types item_state .
```

## Item Records

Item sidecars live under `.ops/items/` and track issues, PRs, or local tasks.

- Keep queryable state in frontmatter only.
- Keep prose in the markdown body.
- Do not add `summary` or `notes` frontmatter fields.
- Use these body headings unless the user wants a different shape:
  `## Summary`, `## Analysis`, `## Plan`, `## Notes`, `## Handoff`
- Include `type: item_state` in frontmatter when creating records manually unless the tooling writes it for you.

For remote issues or PRs, frontmatter should hold remote metadata such as title,
state, URL, and update timestamp. The body should hold the actual assessment.

The item body should usually answer:

- What is happening?
- Why does it matter?
- What did we learn?
- What should happen next?

## Item Identity And Paths

Derive item identity before writing the file so later sessions can find the same
record instead of creating duplicates.

- Treat `id` as the canonical identity.
- For remote items, set `external_ref` to a stable provider reference. Prefer the canonical URL when one exists; otherwise use the provider-specific key.
- For local tasks, set both `key` and `external_ref` to the repo-relative target path such as `tasks/My task.md`.
- For local tasks, set `id` to `local:task:<target_path>`.
- For remote items, set `id` to `<provider>:<kind>:<external_ref>`.
- Set `target_path` for local-file-backed work items. Omit it when no repo path applies.
- When a matching sidecar already exists, update it in place instead of creating a new one.

Use `scripts/derive_item_sidecar_path.py <kind> <external_ref>` to generate the
canonical path under `.ops/items/`. The helper keeps filenames stable by using
`<kind>-<slugified-external-ref>-<sha1(external_ref)[:8]>.md` and truncating the
slug when needed.

Use `scripts/scaffold_item_sidecar.py` when you want the full markdown skeleton
instead of only the path. The scaffold helper derives `id`, `key`, the canonical
path, and local-task defaults, then either prints the sidecar to stdout or writes
it under a target `.ops/` root.

When working against GitHub-backed repos with `gh` available, use the companion
scripts instead of hand-checking missing sidecars:

- `scripts/gh_list_missing_items.py --repo owner/name --ops-root .ops`
- `scripts/gh_seed_missing_items.py --repo owner/name --ops-root .ops --write`

These scripts are intentionally GitHub-specific. They compare remote issues or
PRs against existing `.ops/items/*.md` records using `repo`, `kind`, and
`number`, then seed minimal `local_status: new` sidecars for anything missing.

If you have to create the path manually, follow the same rule:

1. Lowercase `external_ref`.
2. Replace every run of non-alphanumeric characters with `-`.
3. Trim leading or trailing `-`.
4. Prefix the slug with `<kind>-`.
5. Suffix it with `-<sha1(external_ref)[:8]>.md`.
6. Truncate the slug portion if needed rather than removing the hash suffix.

See `references/examples.md` for remote and local examples, including scaffold
and GitHub sync commands.

## Local Task Mapping

Normalize local tasks into the same `item_state` shape as remote work so common
queries still work.

- Use `provider: local` and `kind: task`.
- Mirror the human title into `remote_title`.
- Mirror the task status or open/closed state into `remote_state`.
- Mirror the repo-relative path into `remote_url`.
- Set `remote_updated_at` and `last_seen_remote_updated_at` from the best local timestamp you have.
- Leave remote-only fields blank when you genuinely do not have a value instead of inventing one.

This keeps dashboards and queries consistent across local and remote work items.

## Task Records

Tasks live under `.ops/tasks/` as plain markdown records.

- Keep frontmatter lightweight and queryable.
- The canonical task schema is intentionally `strict: false` so teams can add extra task metadata without fighting the validator.
- Include `type: task` in frontmatter when creating records manually unless the tooling writes it for you.

## Handoffs

Handoffs live under `.ops/handoffs/`.

- Use frontmatter for routing and lifecycle state.
- Use the body for context, blockers, and open questions.
- Include `type: handoff` in frontmatter when creating records manually unless the tooling writes it for you.

See `references/examples.md` for a minimal handoff example.

## Normal Workflow

When working with `.ops/`:

1. Initialize the canonical registry if it does not exist.
2. Create or update the relevant item record.
3. Keep the frontmatter current enough to query the work.
4. Keep the body current enough that a later session can resume quickly.
5. Validate after schema changes or significant edits.

## Validation

After editing `.ops/`, validate from inside the target `.ops/` directory with
the `mdbase` tooling available in the environment.

- Run `mdbase validate .` after schema changes.
- Run `mdbase validate .` after substantial record edits or batch updates.
- Say explicitly when validation tooling is unavailable instead of pretending it passed.
- Treat `.ops/.mdbase/` as transient tool state. Keep it ignored rather than treating it as canonical registry content.
