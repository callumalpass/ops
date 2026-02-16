# ops

`ops` is a markdown-native operations CLI for AI-assisted delivery workflows. It keeps local, typed sidecar state in `.ops/` and pulls live issue/PR data from your configured provider (GitHub, GitLab, Jira, Azure DevOps) at run time. The `.ops/` directory is designed to be committed alongside your code — operational decisions are versioned, diffable, and reviewable in PRs like any other source file.

## Demo

- Recording: [1771241781.trimmed2-nearest.mp4](1771241781.trimmed2-nearest.mp4)

## What it does

`ops` maintains **sidecar files** — one per issue or PR — that hold local operational metadata (priority, difficulty, risk, status, notes) as typed markdown with YAML frontmatter. These sidecars act as shared memory across agent sessions: a triage run writes its assessment to the sidecar, and a later review or handoff run can read it back without re-deriving context.

**Command templates** (also markdown files) define reusable prompts with `{{variable}}` expansion. At run time, `ops` merges provider fields, sidecar fields, and explicit `--var` values into the template, then passes the rendered prompt to an agent CLI as a subprocess.

**Handoff records** capture structured context for passing work between agents or people: next steps, blockers, open questions.

Agents are treated as first-class editors of the workspace. Command templates instruct agents to update sidecars directly — either by editing the file or calling `ops item set` — rather than producing output that `ops` tries to parse. This keeps behavior model-agnostic: any agent that can edit files or run shell commands works.

## Design

`ops` is built on [mdbase](https://mdbase.dev), a structured markdown collection format with typed frontmatter, schema validation, and a query language. Each `.ops/` directory is an mdbase collection — `_types/` defines schemas for commands, item sidecars, and handoffs, and every file is validated against its type.

Three layers:

- **mdbase** — Persistence. Typed markdown files validated against schemas in `_types/*.md`. Supports filtering and sorting via query expressions (`kind == "issue" && local_status == "new"`). Backed by a SQLite cache for speed; correctness doesn't depend on it.
- **Provider context** — Fetched live from your configured provider (`github`, `gitlab`, `jira`, `azure`). Sidecars hold only local operational state.
- **Agent execution** — Shells out to `claude` or `codex`. Interactive mode gives you the full agent TUI; non-interactive mode captures stdout.

The flat `.ops/commands/*.md` layout keeps command discovery and editing simple — `grep`, hand-edit, or have an agent create new templates.

## Install

```bash
git clone https://github.com/callumalpass/ops
cd ops
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

# Address an issue using triage analysis in the sidecar
ops run address-issue --issue 123

# First-class issue workflow (auto-triage if analysis is missing)
ops issue address --issue 123

# Run non-interactively
ops run review-pr --pr 456 --non-interactive
```

## Interactive picker (`fzf`)

Use the helper script to browse GitHub items and run commands interactively:

```bash
./scripts/ops-fzf.sh
```

Requirements: `ops`, `gh`, `fzf`, and `jq` on your `PATH`.

What it does:

- Lists issues and PRs from GitHub (`gh issue list` + `gh pr list`)
- Shows a combined preview with live provider details and local sidecar details (`ops item show`)
- `enter` opens a second `fzf` picker to choose an `ops` command, then runs `ops run ... --interactive`

Main keybindings in the first picker:

- `enter`: open command picker for selected item
- `ctrl-t`: run `triage-issue` directly
- `ctrl-a`: run `address-issue` directly
- `ctrl-p`: run `review-pr` directly
- `ctrl-s`: create/refresh sidecar (`ops item ensure`) for selected item
- `ctrl-f`: toggle list filter (`open`/`all`)
- `ctrl-o`: open selected item in browser
- `ctrl-l`: reload list

Environment variables:

- `OPS_FZF_LIMIT` (default `100`)
- `OPS_FZF_DEFAULT_LIST_MODE` (`open` or `all`, default `all`)
- `OPS_FZF_REPO` (override scope, e.g. `owner/repo`)
- `OPS_FZF_REPO_ROOT` (override repo root)
- `OPS_BIN`, `GH_BIN`, `FZF_BIN`, `JQ_BIN` (override binary names/paths)

## `.ops` layout

```text
.ops/
  config.yaml
  mdbase.yaml
  _types/
    command.md
    item_state.md
    handoff.md
  commands/
    address-issue.md
    triage-issue.md
    review-pr.md
    handoff.md
  items/
  handoffs/
```

`config.yaml` sets repository defaults such as default provider/scope, default CLI/model/mode, and command ids used by shortcuts.

## Commands

### Initialize

```bash
ops init [--repo-root PATH] [--force] [--format text|json]
```

### Command templates

```bash
ops command list
ops command show <id>
ops command new <id> [options] [--format text|json]
ops command validate
ops command render <id> [--issue N|--pr N] [--var k=v ...]
```

### Sidecar items

```bash
ops item ensure --issue N [--repo owner/repo] [--format text|json]
ops item ensure --pr N [--repo owner/repo] [--format text|json]
ops item list [--kind issue|pr] [--status STATUS] [--priority PRIORITY] [--difficulty DIFFICULTY]
ops item show --issue N
ops item show --pr N
ops item set --issue N --field key=value [--field key=value] [--format text|json]
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

### Issue shortcut

```bash
ops issue address --issue N
```

### Handoffs

```bash
ops handoff create --issue N --for-agent codex --next-step "..." [--format text|json]
ops handoff list
ops handoff show <id>
ops handoff close <id> [--format text|json]
```

### Diagnostics

```bash
ops doctor
```

## Repo defaults

`ops` loads optional defaults from `.ops/config.yaml`.

Common fields:

- `default_provider` (`github|gitlab|jira|azure`)
- `default_repo`
- `default_cli`
- `default_mode`
- `default_model`
- `default_permission_mode`
- `default_allowed_tools`
- `default_sandbox_mode`
- `default_approval_policy`
- `commands.triage_issue`
- `commands.address_issue`
- `commands.review_pr`

Precedence:

- CLI flags
- command frontmatter
- `.ops/config.yaml`
- built-in defaults

## Variable expansion

Template variables in command bodies:

- `{{name}}` required
- `{{name|fallback}}` optional with fallback

Context sources:

- Explicit `--var key=value`
- Provider item fields when `--issue`/`--pr` is provided
- Existing sidecar frontmatter fields (if present)

Common available vars for issue/pr runs:

- `item_ref`, `repo`, `kind`, `number`
- `title`, `body`, `author`, `state`, `url`
- `labels`, `labels_csv`, `assignees`, `assignees_csv`
- `head_ref`, `base_ref` (PR only)
- `sidecar_path`, `ops_item_path`, `ops_item_abs_path`
- `now_iso`

## Dependencies

- Provider auth env vars:
  - GitHub: `gh auth status` (uses `gh` CLI)
  - GitLab: `GITLAB_TOKEN` (optional `GITLAB_BASE_URL`)
  - Jira: `JIRA_BASE_URL`, `JIRA_API_TOKEN`, and `JIRA_EMAIL`/`JIRA_USER`
  - Azure DevOps: `AZURE_DEVOPS_PAT` (+ scope via `default_repo` or `AZURE_ORG`/`AZURE_PROJECT`)
- `claude` and/or `codex` CLI for agent execution

## VS Code extension

There is a full VS Code extension scaffold in `vscode-extension/` that wraps this CLI:

- Activity bar views for commands, items, handoffs, and diagnostics
- Command palette actions for init/doctor/triage/review/handoffs
- JSON-backed CLI integration and terminal-backed interactive runs

Open `vscode-extension/` in VS Code and press `F5` to run an Extension Development Host.

Build/package commands:

```bash
npm run build:extension
npm run package:extension
```
