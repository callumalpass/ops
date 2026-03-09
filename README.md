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
cd .ops
mdbase --help
```

Common helpful commands:

- `mdbase validate .`
- `mdbase query 'local_status == "new"' --types item_state .`
- `mdbase read items/example.md .`

## Repo Layout

- `SKILL.md`: the skill instructions
- `agents/openai.yaml`: optional UI metadata
- `assets/ops-registry-template/.ops/`: canonical `.ops` template to mirror into target repos
- `scripts/derive_item_sidecar_path.py`: deterministic item sidecar naming helper
- `scripts/scaffold_item_sidecar.py`: canonical `item_state` scaffolding helper
- `scripts/gh_list_missing_items.py`: list GitHub issues or PRs missing sidecars
- `scripts/gh_seed_missing_items.py`: seed missing GitHub sidecars as `local_status: new`
- `references/examples.md`: canonical examples for manual record creation

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

## Registry Safety

- Create `.ops/` if it is missing.
- Copy missing files from the canonical template.
- Do not overwrite existing records under `items/`, `tasks/`, or `handoffs/` unless the user asks.
- Do not overwrite `_types/` or `mdbase.yaml` blindly; inspect the diff and preserve repo-specific customizations.

## Schema Principles

- `item_state` frontmatter holds identifiers, remote metadata, workflow state, and tags.
- `item_state` bodies hold `Summary`, `Analysis`, `Plan`, `Notes`, and `Handoff`.
- `task` is intentionally flexible so teams can add local metadata without changing the canonical skill.
- `handoff` frontmatter handles routing and status; the body holds context.

## Item Identity

- Treat `id` as the canonical identity and update matching sidecars in place.
- For local tasks, use the repo-relative path as both `key` and `external_ref`.
- For remote items, prefer the canonical URL as `external_ref`.
- Use `scripts/derive_item_sidecar_path.py <kind> <external_ref>` to generate the canonical path under `.ops/items/`.
- Use `scripts/scaffold_item_sidecar.py` to generate a full `item_state` markdown skeleton with the same path and id rules.
- Use `scripts/gh_list_missing_items.py` and `scripts/gh_seed_missing_items.py` for GitHub repos when you need to discover or seed missing sidecars deterministically.
- Include `type: item_state`, `type: task`, or `type: handoff` when creating records manually unless tooling writes it for you.
- Use `references/examples.md` for concrete record shapes.

## Using The Skill

When an agent is asked to initialize `.ops/` in another repo, it should copy or
merge the files from `assets/ops-registry-template/.ops/` into the target repo,
preserve existing local state, and then validate from inside `.ops/` with the
available `mdbase` tooling.
