# ops

`ops` is a markdown-first way to keep operational memory about delivery work in
the repo itself.

In this context, "ops" means the working state around issues, PRs, and tasks:

- what the work item is
- how urgent or risky it is
- what we currently understand about it
- what should happen next
- what another agent or person would need to continue the work

This repo packages that model as a skill plus a canonical `.ops/` template
backed by `mdbase`.

## What `mdbase` Is

`mdbase` treats a folder of markdown files as a typed collection.

- `mdbase.yaml` marks the collection root and configures behavior.
- `_types/*.md` defines schemas as markdown files with YAML frontmatter.
- Regular `.md` files are records with frontmatter plus body content.
- The collection can then be validated and queried as structured data without
  giving up plain markdown files as the source of truth.

`ops` is best thought of as a domain-specific `mdbase` collection for delivery
work: a schema and workflow for keeping operational memory in markdown.

## What `.ops/` Is For

The goal of `.ops/` is to act as durable shared memory for the repo.

It should let an agent or human answer:

- What items are active?
- Which items matter most?
- What is the current understanding of each item?
- What is the plan?
- What is blocked?
- What should happen next?

## Operating Model

- `mdbase` handles schema validation and querying.
- Markdown files under `.ops/` hold the actual state.
- Frontmatter holds compact, queryable fields.
- The markdown body holds analysis, plans, decisions, notes, and handoff context.
- The skill tells an agent how to initialize and maintain the registry.

## Optional Tooling

You can maintain `.ops/` entirely by editing markdown files and relying on
`mdbase` semantics.

If you want a CLI companion, `mdbase-cli` is useful for validation and queries:

```bash
npm install -g mdbase-cli
mdbase --help
```

Common helpful commands:

- `mdbase validate .ops`
- `mdbase query 'local_status == "new"' --types item_state .ops`
- `mdbase read items/example.md .ops`

## Repo Layout

- `SKILL.md`: the skill instructions
- `agents/openai.yaml`: optional UI metadata
- `assets/ops-registry-template/.ops/`: canonical `.ops` template to mirror into target repos

## Canonical `.ops` Layout

```text
.ops/
  mdbase.yaml
  _types/
    item_state.md
    task.md
    handoff.md
  items/
  tasks/
  handoffs/
```

## Schema Principles

- `item_state` frontmatter holds identifiers, remote metadata, workflow state, and tags.
- `item_state` bodies hold `Summary`, `Analysis`, `Plan`, `Notes`, and `Handoff`.
- `task` is intentionally flexible so teams can add local metadata without changing the canonical skill.
- `handoff` frontmatter handles routing and status; the body holds context.

## Using The Skill

When an agent is asked to initialize `.ops/` in another repo, it should copy or
mirror the files from `assets/ops-registry-template/.ops/` into the target repo
and then validate with the available `mdbase` tooling.
