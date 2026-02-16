#!/usr/bin/env bash
set -euo pipefail

OPS_BIN="${OPS_BIN:-ops}"
GH_BIN="${GH_BIN:-gh}"
FZF_BIN="${FZF_BIN:-fzf}"
JQ_BIN="${JQ_BIN:-jq}"
OPS_FZF_LIMIT="${OPS_FZF_LIMIT:-100}"
OPS_FZF_DEFAULT_LIST_MODE="${OPS_FZF_DEFAULT_LIST_MODE:-all}"
OPS_FZF_ISSUE_STATE="${OPS_FZF_ISSUE_STATE:-}"
OPS_FZF_PR_STATE="${OPS_FZF_PR_STATE:-}"

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_Q="$(printf '%q' "$SCRIPT_PATH")"

die() {
  printf "error: %s\n" "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}

get_repo_root() {
  if [[ -n "${OPS_FZF_REPO_ROOT:-}" ]]; then
    printf "%s\n" "$OPS_FZF_REPO_ROOT"
    return
  fi
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

get_repo_scope() {
  if [[ -n "${OPS_FZF_REPO:-}" ]]; then
    printf "%s\n" "$OPS_FZF_REPO"
    return
  fi
  local repo_root
  repo_root="$(get_repo_root)"
  "$GH_BIN" repo view --json nameWithOwner -q .nameWithOwner --repo . 2>/dev/null \
    || (cd "$repo_root" && "$GH_BIN" repo view --json nameWithOwner -q .nameWithOwner)
}

state_file() {
  if [[ -n "${OPS_FZF_STATE_FILE:-}" ]]; then
    printf "%s\n" "$OPS_FZF_STATE_FILE"
    return
  fi
  local repo_root safe
  repo_root="$(get_repo_root)"
  safe="${repo_root//\//_}"
  printf "/tmp/ops-fzf%s.mode\n" "$safe"
}

get_list_mode() {
  if [[ -n "${OPS_FZF_LIST_MODE:-}" ]]; then
    printf "%s\n" "$OPS_FZF_LIST_MODE"
    return
  fi

  local file mode
  file="$(state_file)"
  if [[ -f "$file" ]]; then
    mode="$(tr -d '[:space:]' <"$file")"
    if [[ "$mode" == "open" || "$mode" == "all" ]]; then
      printf "%s\n" "$mode"
      return
    fi
  fi

  printf "%s\n" "$OPS_FZF_DEFAULT_LIST_MODE"
}

set_list_mode() {
  local mode="$1"
  local file
  [[ "$mode" == "open" || "$mode" == "all" ]] || die "invalid list mode: $mode"
  file="$(state_file)"
  printf "%s\n" "$mode" >"$file"
}

toggle_list_mode() {
  local current next
  current="$(get_list_mode)"
  if [[ "$current" == "open" ]]; then
    next="all"
  else
    next="open"
  fi
  set_list_mode "$next"
  printf "filter mode: %s\n" "$next"
}

list_items() {
  local repo_root repo issue_json pr_json issue_state pr_state filter_mode mode_tag
  repo_root="$(get_repo_root)"
  repo="$(get_repo_scope)"
  filter_mode="$(get_list_mode)"
  mode_tag="$(printf "%s" "$filter_mode" | tr '[:lower:]' '[:upper:]')"

  if [[ -n "$OPS_FZF_ISSUE_STATE" ]]; then
    issue_state="$OPS_FZF_ISSUE_STATE"
  else
    issue_state="$filter_mode"
  fi
  if [[ -n "$OPS_FZF_PR_STATE" ]]; then
    pr_state="$OPS_FZF_PR_STATE"
  else
    pr_state="$filter_mode"
  fi

  issue_json="$(cd "$repo_root" && "$GH_BIN" issue list \
    --repo "$repo" \
    --state "$issue_state" \
    --limit "$OPS_FZF_LIMIT" \
    --json number,title,state,author,labels,updatedAt,url)"

  pr_json="$(cd "$repo_root" && "$GH_BIN" pr list \
    --repo "$repo" \
    --state "$pr_state" \
    --limit "$OPS_FZF_LIMIT" \
    --json number,title,state,author,labels,updatedAt,url,isDraft)"

  "$JQ_BIN" -nr \
    --argjson issues "$issue_json" \
    --argjson prs "$pr_json" \
    --arg repo "$repo" \
    --arg mode_tag "$mode_tag" \
    '
      def clean: tostring | gsub("[\t\r\n]+"; " ");
      def labels: ((.labels // []) | map(.name) | join(","));

      (
        ($issues | map({
          kind: "issue",
          number: .number,
          title: (.title // ""),
          state: (.state // "UNKNOWN"),
          author: (.author.login // ""),
          labels: labels,
          updated_at: (.updatedAt // ""),
          url: (.url // "")
        }))
        +
        ($prs | map({
          kind: "pr",
          number: .number,
          title: (.title // ""),
          state: (if .isDraft then "DRAFT" else (.state // "UNKNOWN") end),
          author: (.author.login // ""),
          labels: labels,
          updated_at: (.updatedAt // ""),
          url: (.url // "")
        }))
      )
      | sort_by(.updated_at) | reverse
      | .[]
      | [
          ("[" + $mode_tag + "] " + (.kind | ascii_upcase) + " #" + (.number | tostring) + " [" + (.state | clean) + "] " + (.title | clean)),
          .kind,
          (.number | tostring),
          $repo,
          (.state | clean),
          (.author | clean),
          (.labels | clean),
          (.updated_at | clean),
          (.url | clean)
        ]
      | @tsv
    '
}

preview_github() {
  local kind="$1"
  local number="$2"
  local repo="$3"
  local output

  if [[ "$kind" == "pr" ]]; then
    if ! output="$("$GH_BIN" pr view "$number" --repo "$repo" \
      --json number,title,state,isDraft,author,labels,assignees,updatedAt,url,headRefName,baseRefName,body 2>&1)"; then
      printf "%s\n" "$output"
      return
    fi
  else
    if ! output="$("$GH_BIN" issue view "$number" --repo "$repo" \
      --json number,title,state,author,labels,assignees,updatedAt,url,body 2>&1)"; then
      printf "%s\n" "$output"
      return
    fi
  fi

  "$JQ_BIN" -r --arg kind "$kind" '
    def join_names(field):
      ((. // []) | map(.[field] // "") | map(select(length > 0)) | join(", "));
    [
      (($kind | ascii_upcase) + " #" + (.number | tostring)),
      ("title: " + (.title // "")),
      ("state: " + (if $kind == "pr" and (.isDraft // false) then "DRAFT" else (.state // "") end)),
      ("author: " + (.author.login // "")),
      ("labels: " + ((.labels | join_names("name")) // "")),
      ("assignees: " + ((.assignees | join_names("login")) // "")),
      (if $kind == "pr" then ("branch: " + (.baseRefName // "?") + " <- " + (.headRefName // "?")) else empty end),
      ("updated: " + (.updatedAt // "")),
      ("url: " + (.url // "")),
      "",
      "body:",
      (.body // "")
    ]
    | .[]
  ' <<<"$output" | sed -n '1,220p'
}

preview_sidecar() {
  local kind="$1"
  local number="$2"
  local repo="$3"
  local repo_root output
  repo_root="$(get_repo_root)"

  if output="$("$OPS_BIN" item show --repo-root "$repo_root" "--$kind" "$number" 2>&1)"; then
    printf "%s\n" "$output"
    return
  fi

  printf "No sidecar found yet.\n\n"
  printf "Press ctrl-s in the list to create/refresh it.\n"
  printf "Manual command:\n"
  printf "  %s item ensure --repo-root %q --%s %s --repo %s\n\n" "$OPS_BIN" "$repo_root" "$kind" "$number" "$repo"
  printf "%s\n" "$output"
}

preview_item() {
  local kind="$1"
  local number="$2"
  local repo="$3"

  printf "=== GitHub (%s #%s) ===\n\n" "$kind" "$number"
  preview_github "$kind" "$number" "$repo"
  printf "\n=== Sidecar (.ops) ===\n\n"
  preview_sidecar "$kind" "$number" "$repo"
}

sync_sidecar() {
  local kind="$1"
  local number="$2"
  local repo="$3"
  local repo_root
  repo_root="$(get_repo_root)"
  "$OPS_BIN" item ensure --repo-root "$repo_root" "--$kind" "$number" --repo "$repo" >/dev/null
}

open_item_web() {
  local kind="$1"
  local number="$2"
  local repo="$3"
  if [[ "$kind" == "pr" ]]; then
    "$GH_BIN" pr view "$number" --repo "$repo" --web >/dev/null
    return
  fi
  "$GH_BIN" issue view "$number" --repo "$repo" --web >/dev/null
}

list_commands() {
  local repo_root
  repo_root="$(get_repo_root)"

  "$OPS_BIN" command list --repo-root "$repo_root" --format json \
    | "$JQ_BIN" -r '
      def clean: tostring | gsub("[\t\r\n]+"; " ");
      .[]
      | .frontmatter as $fm
      | select(($fm.active // true) == true)
      | [
          ($fm.id // ""),
          ($fm.scope // ""),
          ($fm.description // "")
        ]
      | [
          ((.[0] | clean) + "  [" + (.[1] | clean) + "] " + (.[2] | clean)),
          (.[0] | clean),
          (.[1] | clean),
          (.[2] | clean)
        ]
      | @tsv
    '
}

preview_command() {
  local command_id="$1"
  local repo_root
  repo_root="$(get_repo_root)"
  "$OPS_BIN" command show --repo-root "$repo_root" "$command_id" 2>&1 | sed -n '1,220p'
}

pick_command() {
  local kind="$1"
  local number="$2"
  local repo="$3"
  local key line command_id
  local -a chosen

  mapfile -t chosen < <(
    list_commands | "$FZF_BIN" \
      --ansi \
      --delimiter=$'\t' \
      --with-nth=1 \
      --expect=enter,ctrl-t,ctrl-a,ctrl-p \
      --header="Pick command for ${kind} #${number} | enter: select | ctrl-t: triage-issue | ctrl-a: address-issue | ctrl-p: review-pr" \
      --preview="${SCRIPT_Q} __preview-command {2}" \
      --preview-window='right,60%,wrap'
  )

  [[ ${#chosen[@]} -ge 2 ]] || return 1
  key="${chosen[0]}"
  line="${chosen[1]}"

  case "$key" in
    ctrl-t) command_id="triage-issue" ;;
    ctrl-a) command_id="address-issue" ;;
    ctrl-p) command_id="review-pr" ;;
    *) IFS=$'\t' read -r _display command_id _scope _description <<<"$line" ;;
  esac

  [[ -n "$command_id" ]] || return 1
  run_command "$command_id" "$kind" "$number" "$repo"
}

run_command() {
  local command_id="$1"
  local kind="$2"
  local number="$3"
  local repo="$4"
  local repo_root
  repo_root="$(get_repo_root)"

  exec "$OPS_BIN" run "$command_id" \
    --repo-root "$repo_root" \
    "--$kind" "$number" \
    --repo "$repo" \
    --provider github \
    --interactive
}

pick_item() {
  local key line kind number repo command_id
  local -a chosen

  mapfile -t chosen < <(
    list_items | "$FZF_BIN" \
      --ansi \
      --delimiter=$'\t' \
      --with-nth=1 \
      --expect=enter,ctrl-t,ctrl-a,ctrl-p \
      --bind="ctrl-l:reload(${SCRIPT_Q} __list-items)" \
      --bind="ctrl-s:execute-silent(${SCRIPT_Q} __sync-sidecar {2} {3} {4})+reload(${SCRIPT_Q} __list-items)" \
      --bind="ctrl-f:execute-silent(${SCRIPT_Q} __toggle-filter)+reload(${SCRIPT_Q} __list-items)" \
      --bind="ctrl-o:execute-silent(${SCRIPT_Q} __open-web {2} {3} {4})" \
      --header="enter: command picker | ctrl-t: triage-issue | ctrl-a: address-issue | ctrl-p: review-pr | ctrl-s: sync sidecar | ctrl-f: toggle open/all | ctrl-o: open in browser | ctrl-l: reload" \
      --preview="${SCRIPT_Q} __preview-item {2} {3} {4}" \
      --preview-window='right,65%,wrap'
  )

  [[ ${#chosen[@]} -ge 2 ]] || exit 0
  key="${chosen[0]}"
  line="${chosen[1]}"
  IFS=$'\t' read -r _display kind number repo _state _author _labels _updated _url <<<"$line"

  case "$key" in
    ctrl-t) command_id="triage-issue" ;;
    ctrl-a) command_id="address-issue" ;;
    ctrl-p) command_id="review-pr" ;;
    *) command_id="" ;;
  esac

  if [[ -n "$command_id" ]]; then
    run_command "$command_id" "$kind" "$number" "$repo"
    return
  fi

  pick_command "$kind" "$number" "$repo"
}

case "${1:-}" in
  __list-items)
    list_items
    exit 0
    ;;
  __preview-sidecar)
    shift
    preview_sidecar "$@"
    exit 0
    ;;
  __preview-item)
    shift
    preview_item "$@"
    exit 0
    ;;
  __sync-sidecar)
    shift
    sync_sidecar "$@"
    exit 0
    ;;
  __open-web)
    shift
    open_item_web "$@"
    exit 0
    ;;
  __preview-command)
    shift
    preview_command "$@"
    exit 0
    ;;
  __toggle-filter)
    toggle_list_mode
    exit 0
    ;;
esac

require_cmd "$OPS_BIN"
require_cmd "$GH_BIN"
require_cmd "$FZF_BIN"
require_cmd "$JQ_BIN"
pick_item
