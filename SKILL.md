---
name: ops-registry
description: Maintain a repo-local `.ops/` registry that gives agents and humans durable shared memory about work. Use when setting up `.ops`, triaging issues, PRs, or tasks, tracking workflow state, recording analysis and plans, or creating handoffs so future sessions do not need to rediscover context.
---

# Ops Registry

Use this skill when the user wants a markdown-native registry of work in `.ops/`.

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

When asked to initialize `.ops/` in another repo:

1. Create `.ops/` if missing.
2. Mirror the files from `assets/ops-registry-template/.ops/`.
3. Do not invent alternate schemas unless the user asks.
4. Keep the registry markdown-only. Only add scripts or extra tooling if the user explicitly asks for them.

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

- `mdbase --help`
- `mdbase validate .ops`
- `mdbase query 'local_status == "new"' --types item_state .ops`

## Item Records

Item sidecars live under `.ops/items/` and track issues, PRs, or local tasks.

- Keep queryable state in frontmatter only.
- Keep prose in the markdown body.
- Do not add `summary` or `notes` frontmatter fields.
- Use these body headings unless the user wants a different shape:
  `## Summary`, `## Analysis`, `## Plan`, `## Notes`, `## Handoff`

For remote issues or PRs, frontmatter should hold remote metadata such as title,
state, URL, and update timestamp. The body should hold the actual assessment.

The item body should usually answer:

- What is happening?
- Why does it matter?
- What did we learn?
- What should happen next?

## Task Records

Tasks live under `.ops/tasks/` as plain markdown records.

- Keep frontmatter lightweight and queryable.
- The canonical task schema is intentionally `strict: false` so teams can add extra task metadata without fighting the validator.

## Handoffs

Handoffs live under `.ops/handoffs/`.

- Use frontmatter for routing and lifecycle state.
- Use the body for context, blockers, and open questions.

## Normal Workflow

When working with `.ops/`:

1. Initialize the canonical registry if it does not exist.
2. Create or update the relevant item record.
3. Keep the frontmatter current enough to query the work.
4. Keep the body current enough that a later session can resume quickly.
5. Validate after schema changes or significant edits.

## Validation

After editing `.ops/`, validate with the `mdbase` tooling available in the environment.
If validation is unavailable, say so explicitly rather than pretending it passed.
