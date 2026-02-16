# ops

`ops` is a markdown-native operations CLI for AI-assisted GitHub workflows.

It keeps local, typed sidecar state in `./.ops/` and uses live GitHub data via `gh` when running commands.

## What it does

- Stores command templates as markdown files (`.ops/commands/*.md`)
- Stores issue/PR sidecar state (`.ops/items/issue-123.md`, `.ops/items/pr-456.md`)
- Renders templates with variable expansion (`{{var}}`, `{{var|default}}`)
- Runs templates through agent CLIs (`claude` or `codex`)
- Supports interactive and non-interactive execution
- Creates structured handoff records

It does **not** store run transcripts. Agent CLIs manage runs/transcripts directly.
It also does **not** parse model output; commands should instruct agents to edit `.ops` files directly.

## Design rationale

`ops` is intentionally small and file-first. GitHub stays the source of truth for issue and PR content, while `.ops/items/*.md` acts as local operational memory that agents and humans can shape together. That split avoids trying to mirror all remote state and keeps local workflow decisions explicit, versioned, and reviewable in git.

The tool also treats agents as first-class editors of the workspace instead of trying to parse their output. Command templates are designed to have agents update sidecars directly (or use `ops item set` for structured field updates), which keeps behavior model-agnostic and avoids brittle parser logic tied to specific output formats.

`ops` does not duplicate transcript storage because agent CLIs already handle run history well. Its job is narrower: provide typed state, command templates, and predictable workflow glue. Frontmatter stays compact and queryable (`local_status`, `priority`, `risk`, etc.), while markdown bodies carry richer analysis and context. The flat `.ops/commands/*.md` layout keeps command discovery and editing simple for both people and agents.

## Install

```bash
cd ~/projects/ops
npm install
npm run build
npm link
```

Then use `ops` anywhere.

## Quick start

```bash
# In your repo root
ops init

# Check setup
ops doctor

# List starter commands
ops command list

# Preview template rendering
ops command render triage-issue --var item_ref=my/repo#1 --var title="Example"

# Run against a live issue (interactive by default)
ops run triage-issue --issue 123

# Run non-interactively
ops run review-pr --pr 456 --non-interactive
```

## `.ops` layout

```text
.ops/
  mdbase.yaml
  _types/
    command.md
    item_state.md
    handoff.md
  commands/
    triage-issue.md
    review-pr.md
    handoff.md
  items/
  handoffs/
```

## Commands

### Initialize

```bash
ops init [--repo-root PATH] [--force]
```

### Command templates

```bash
ops command list
ops command show <id>
ops command new <id> [options]
ops command validate
ops command render <id> [--issue N|--pr N] [--var k=v ...]
```

### Sidecar items

```bash
ops item ensure --issue N [--repo owner/repo]
ops item ensure --pr N [--repo owner/repo]
ops item list [--kind issue|pr] [--status STATUS] [--priority PRIORITY]
ops item show --issue N
ops item show --pr N
ops item set --issue N --field key=value [--field key=value]
```

### Run templates

```bash
ops run <command-id> [--issue N|--pr N] [--interactive|--non-interactive]
ops run <command-id> --var key=value --var key=value
```

### Triage shortcut

```bash
ops triage --issue N
ops triage --pr N
```

### Handoffs

```bash
ops handoff create --issue N --for-agent codex --next-step "..."
ops handoff list
ops handoff show <id>
ops handoff close <id>
```

### Diagnostics

```bash
ops doctor
```

## Variable expansion

Template variables in command bodies:

- `{{name}}` required
- `{{name|fallback}}` optional with fallback

Context sources:

- Explicit `--var key=value`
- GitHub item fields when `--issue`/`--pr` is provided
- Existing sidecar frontmatter fields (if present)

Common available vars for issue/pr runs:

- `item_ref`, `repo`, `kind`, `number`
- `title`, `body`, `author`, `state`, `url`
- `labels`, `labels_csv`, `assignees`, `assignees_csv`
- `head_ref`, `base_ref` (PR only)
- `sidecar_path`, `ops_item_path`, `ops_item_abs_path`
- `now_iso`

## Dependencies

- `gh` (GitHub CLI) for issue/PR context
- `claude` and/or `codex` CLI for agent execution
