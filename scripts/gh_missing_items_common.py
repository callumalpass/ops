#!/usr/bin/env python3

import json
import subprocess
from pathlib import Path

import yaml

GH_FIELDS = "number,title,url,author,state,updatedAt"


def load_existing_triples(ops_root: str) -> set[tuple[str, str, str]]:
    items_dir = Path(ops_root) / "items"
    triples: set[tuple[str, str, str]] = set()
    if not items_dir.exists():
        return triples

    for path in sorted(items_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            continue
        parts = text.split("---", 2)
        if len(parts) < 3:
            continue
        frontmatter = yaml.safe_load(parts[1]) or {}
        repo = frontmatter.get("repo")
        kind = frontmatter.get("kind")
        number = frontmatter.get("number")
        if repo and kind and number is not None:
            triples.add((str(repo), str(kind), str(number)))
    return triples


def load_fixture(path: str) -> dict[str, list[dict]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, list):
        return {"issues": data, "prs": []}
    return {
        "issues": list(data.get("issues", [])),
        "prs": list(data.get("prs", [])),
    }


def run_gh_list(repo: str, kind: str, state: str, limit: int) -> list[dict]:
    command = [
        "gh",
        kind,
        "list",
        "--repo",
        repo,
        "--state",
        state,
        "--limit",
        str(limit),
        "--json",
        GH_FIELDS,
    ]
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise SystemExit(
            "gh CLI is required for this script; install it and run `gh auth status`."
        ) from exc

    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "gh command failed"
        raise SystemExit(message)

    return json.loads(result.stdout or "[]")


def get_remote_payload(
    repo: str, kinds: list[str], state: str, limit: int, from_json: str | None
) -> dict[str, list[dict]]:
    if from_json:
        payload = load_fixture(from_json)
    else:
        payload = {"issues": [], "prs": []}
        if "issue" in kinds:
            payload["issues"] = run_gh_list(repo, "issue", state, limit)
        if "pr" in kinds:
            payload["prs"] = run_gh_list(repo, "pr", state, limit)
    return payload


def normalize_remote_item(repo: str, kind: str, raw: dict) -> dict:
    number = str(raw["number"])
    title = raw.get("title") or ""
    url = raw.get("url") or ""
    state = (raw.get("state") or "").lower()
    updated_at = raw.get("updatedAt")
    author = raw.get("author") or {}
    author_login = author.get("login") if isinstance(author, dict) else None
    if kind == "pr":
        fallback_ref = f"{repo}#PR{number}"
    else:
        fallback_ref = f"{repo}#{number}"

    return {
        "provider": "github",
        "kind": kind,
        "key": number,
        "external_ref": url or fallback_ref,
        "repo": repo,
        "number": int(number),
        "remote_state": state or None,
        "remote_title": title or None,
        "remote_author": author_login or None,
        "remote_url": url or None,
        "remote_updated_at": updated_at or None,
        "last_seen_remote_updated_at": updated_at or None,
    }


def find_missing_remote_items(
    repo: str,
    ops_root: str,
    kinds: list[str],
    state: str,
    limit: int,
    from_json: str | None,
) -> list[dict]:
    payload = get_remote_payload(repo, kinds, state, limit, from_json)
    existing = load_existing_triples(ops_root)
    missing: list[dict] = []

    for raw in payload.get("issues", []):
        normalized = normalize_remote_item(repo, "issue", raw)
        triple = (repo, "issue", str(normalized["number"]))
        if triple not in existing:
            missing.append(normalized)

    for raw in payload.get("prs", []):
        normalized = normalize_remote_item(repo, "pr", raw)
        triple = (repo, "pr", str(normalized["number"]))
        if triple not in existing:
            missing.append(normalized)

    return sorted(missing, key=lambda item: (item["kind"], item["number"]))
