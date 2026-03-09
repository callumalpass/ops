#!/usr/bin/env python3

import argparse
from types import SimpleNamespace

from gh_missing_items_common import find_missing_remote_items
from scaffold_item_sidecar import ordered_fields, render_frontmatter, write_output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed missing GitHub issue or PR sidecars with local_status=new."
    )
    parser.add_argument("--repo", required=True, help="GitHub repo in owner/name format")
    parser.add_argument(
        "--ops-root",
        default=".ops",
        help="Path to the .ops root that contains items/",
    )
    parser.add_argument(
        "--kind",
        choices=["issue", "pr", "all"],
        default="all",
        help="Remote item kind to seed",
    )
    parser.add_argument(
        "--state",
        choices=["open", "all"],
        default="open",
        help="GitHub state to query",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Max items to fetch per GitHub list call",
    )
    parser.add_argument(
        "--from-json",
        help="Optional fixture file with {issues:[...], prs:[...]} for offline testing",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Actually create files. Without this flag the script only reports planned writes.",
    )
    return parser.parse_args()


def render_seed_markdown(item: dict) -> str:
    args = SimpleNamespace(
        provider=item["provider"],
        kind=item["kind"],
        external_ref=item["external_ref"],
        id=None,
        key=item["key"],
        repo=item["repo"],
        number=item["number"],
        target_path=None,
        remote_title=item["remote_title"],
        remote_state=item["remote_state"],
        remote_author=item["remote_author"],
        remote_url=item["remote_url"],
        remote_updated_at=item["remote_updated_at"],
        last_seen_remote_updated_at=item["last_seen_remote_updated_at"],
        local_status="new",
        priority=None,
        difficulty=None,
        risk=None,
        owner=None,
        tag=[],
        sync_state="clean",
        last_analyzed_at=None,
        summary=None,
        analysis=None,
        plan=None,
        notes=None,
        handoff=None,
    )
    return render_frontmatter(ordered_fields(args)) + "\n"


def main() -> int:
    args = parse_args()
    kinds = ["issue", "pr"] if args.kind == "all" else [args.kind]
    missing = find_missing_remote_items(
        repo=args.repo,
        ops_root=args.ops_root,
        kinds=kinds,
        state=args.state,
        limit=args.limit,
        from_json=args.from_json,
    )

    if not missing:
        print("No missing item sidecars.")
        return 0

    created = 0
    for item in missing:
        markdown = render_seed_markdown(item)
        if args.write:
            path = write_output(
                markdown,
                args.ops_root,
                item["kind"],
                item["external_ref"],
                overwrite=False,
            )
            print(path)
            created += 1
        else:
            print(
                f"would create {item['kind']} #{item['number']} -> {item['external_ref']}"
            )

    if args.write:
        print(f"\nCreated sidecars: {created}")
    else:
        print(f"\nPlanned sidecars: {len(missing)}")
        print("Re-run with --write to create them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
