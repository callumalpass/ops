#!/usr/bin/env python3

import argparse
import hashlib
import re
import sys

MAX_BASENAME_LEN = 70
HASH_LEN = 8


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def build_path(kind: str, external_ref: str) -> str:
    kind_slug = slugify(kind)
    ref_slug = slugify(external_ref)
    hash_suffix = hashlib.sha1(external_ref.encode("utf-8")).hexdigest()[:HASH_LEN]
    fixed_len = len(kind_slug) + len(hash_suffix) + 2
    max_slug_len = max(1, MAX_BASENAME_LEN - fixed_len)
    ref_slug = ref_slug[:max_slug_len].rstrip("-") or "item"
    filename = f"{kind_slug}-{ref_slug}-{hash_suffix}.md"
    return f"items/{filename}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Derive the canonical .ops item sidecar path."
    )
    parser.add_argument("kind", help="Work item kind, for example: issue, pr, task")
    parser.add_argument(
        "external_ref",
        help="Stable external reference, such as an issue URL or local target path",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sys.stdout.write(build_path(args.kind, args.external_ref) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
