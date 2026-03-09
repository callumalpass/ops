#!/usr/bin/env python3

import argparse
import sys
from pathlib import Path

from derive_item_sidecar_path import build_path

PROVIDERS = ["github", "gitlab", "jira", "azure", "local"]
KINDS = ["issue", "pr", "task"]
LOCAL_STATUSES = ["new", "triaged", "in_progress", "blocked", "done", "wontfix"]
PRIORITIES = ["low", "medium", "high", "critical"]
DIFFICULTIES = ["trivial", "easy", "medium", "hard", "complex"]
RISKS = ["low", "medium", "high"]
SYNC_STATES = ["clean", "dirty", "conflict"]


def quote_yaml(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def section_block(title: str, value: str | None) -> str:
    if value:
        return f"## {title}\n{value.strip()}\n"
    return f"## {title}\n"


def derive_local_task_title(target_path: str) -> str:
    return Path(target_path).stem


def derive_item_id(
    provider: str, kind: str, external_ref: str, target_path: str | None
) -> str:
    if provider == "local" and kind == "task":
        return f"local:task:{target_path or external_ref}"
    return f"{provider}:{kind}:{external_ref}"


def ordered_fields(args: argparse.Namespace) -> list[tuple[str, object]]:
    target_path = args.target_path
    if args.provider == "local" and args.kind == "task" and target_path is None:
        target_path = args.external_ref

    key = args.key
    if key is None and args.provider == "local" and args.kind == "task":
        key = target_path or args.external_ref
    if key is None:
        key = str(args.number) if args.number is not None else args.external_ref

    remote_title = args.remote_title
    if remote_title is None and args.provider == "local" and args.kind == "task":
        remote_title = derive_local_task_title(target_path or args.external_ref)

    remote_state = args.remote_state
    if remote_state is None and args.provider == "local" and args.kind == "task":
        remote_state = "open"

    remote_url = args.remote_url
    if remote_url is None and args.provider == "local" and args.kind == "task":
        remote_url = target_path or args.external_ref

    last_seen_remote_updated_at = args.last_seen_remote_updated_at
    if last_seen_remote_updated_at is None and args.remote_updated_at is not None:
        last_seen_remote_updated_at = args.remote_updated_at

    return [
        (
            "id",
            args.id
            or derive_item_id(args.provider, args.kind, args.external_ref, target_path),
        ),
        ("provider", args.provider),
        ("kind", args.kind),
        ("key", key),
        ("repo", args.repo),
        ("number", args.number),
        ("external_ref", args.external_ref),
        ("target_path", target_path),
        ("remote_title", remote_title),
        ("remote_state", remote_state),
        ("remote_author", args.remote_author),
        ("remote_url", remote_url),
        ("remote_updated_at", args.remote_updated_at),
        ("last_seen_remote_updated_at", last_seen_remote_updated_at),
        ("local_status", args.local_status),
        ("priority", args.priority),
        ("difficulty", args.difficulty),
        ("risk", args.risk),
        ("owner", args.owner),
        ("tags", args.tag),
        ("sync_state", args.sync_state),
        ("last_analyzed_at", args.last_analyzed_at),
        ("type", "item_state"),
    ]


def render_frontmatter(fields: list[tuple[str, object]]) -> str:
    lines = ["---"]
    for key, value in fields:
        if value is None or value == []:
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {quote_yaml(item)}")
            continue
        if isinstance(value, int):
            lines.append(f"{key}: {value}")
            continue
        lines.append(f"{key}: {quote_yaml(str(value))}")
    lines.append("---")
    return "\n".join(lines)


def render_markdown(args: argparse.Namespace) -> str:
    frontmatter = render_frontmatter(ordered_fields(args))
    sections = [
        section_block("Summary", args.summary),
        section_block("Analysis", args.analysis),
        section_block("Plan", args.plan),
        section_block("Notes", args.notes),
        section_block("Handoff", args.handoff),
    ]
    body = "\n".join(sections).rstrip() + "\n"
    return frontmatter + "\n\n" + body


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scaffold a canonical .ops item_state sidecar."
    )
    parser.add_argument("--provider", required=True, choices=PROVIDERS)
    parser.add_argument("--kind", required=True, choices=KINDS)
    parser.add_argument(
        "--external-ref",
        required=True,
        help="Stable provider reference, such as a canonical URL or local task path",
    )
    parser.add_argument("--id", help="Override the derived item id")
    parser.add_argument("--key", help="Override the derived key")
    parser.add_argument("--repo", help="Repository slug, for example: owner/name")
    parser.add_argument("--number", type=int, help="Remote issue or PR number")
    parser.add_argument(
        "--target-path",
        help="Repo-relative path for local-file-backed items",
    )
    parser.add_argument("--remote-title")
    parser.add_argument("--remote-state")
    parser.add_argument("--remote-author")
    parser.add_argument("--remote-url")
    parser.add_argument("--remote-updated-at")
    parser.add_argument("--last-seen-remote-updated-at")
    parser.add_argument("--local-status", default="new", choices=LOCAL_STATUSES)
    parser.add_argument("--priority", choices=PRIORITIES)
    parser.add_argument("--difficulty", choices=DIFFICULTIES)
    parser.add_argument("--risk", choices=RISKS)
    parser.add_argument("--owner")
    parser.add_argument("--tag", action="append", default=[])
    parser.add_argument("--sync-state", default="clean", choices=SYNC_STATES)
    parser.add_argument("--last-analyzed-at")
    parser.add_argument("--summary")
    parser.add_argument("--analysis")
    parser.add_argument("--plan")
    parser.add_argument("--notes")
    parser.add_argument("--handoff")
    parser.add_argument(
        "--write-root",
        help="Write the generated sidecar under this .ops directory instead of stdout",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting an existing generated sidecar file",
    )
    return parser.parse_args()


def write_output(
    markdown: str, write_root: str, kind: str, external_ref: str, overwrite: bool
) -> str:
    output_root = Path(write_root)
    output_path = output_root / build_path(kind, external_ref)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not overwrite:
        raise FileExistsError(
            f"{output_path} already exists; pass --overwrite to replace it"
        )
    output_path.write_text(markdown, encoding="utf-8")
    return str(output_path)


def main() -> int:
    args = parse_args()
    markdown = render_markdown(args)

    if args.write_root:
        path = write_output(
            markdown, args.write_root, args.kind, args.external_ref, args.overwrite
        )
        sys.stdout.write(path + "\n")
        return 0

    sys.stdout.write(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
