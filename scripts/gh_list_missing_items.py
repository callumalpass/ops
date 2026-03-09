#!/usr/bin/env python3

import argparse
import json

from gh_missing_items_common import find_missing_remote_items


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List GitHub issues or PRs that do not yet have .ops item sidecars."
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
        help="Remote item kind to inspect",
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
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format",
    )
    return parser.parse_args()


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

    if args.format == "json":
        print(json.dumps(missing, indent=2))
        return 0

    if not missing:
        print("No missing item sidecars.")
        return 0

    for item in missing:
        print(
            f"{item['kind']:>5} #{item['number']:<6} {item['remote_title'] or item['external_ref']}"
        )
        if item.get("remote_url"):
            print(f"      {item['remote_url']}")
    print(f"\nMissing sidecars: {len(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
