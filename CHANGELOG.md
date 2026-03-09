# Changelog

## 2026-03-09

### Changed

- Reframed the project as `ops-registry`: a skill-first, markdown-only workflow
  for keeping repo-local operational memory about issues, PRs, and tasks.
- Rewrote the skill and README around the actual goal of `ops`: durable shared
  working memory, triage state, plans, notes, and handoffs.
- Made the `mdbase` framing explicit. `ops` is now described as a
  domain-specific `mdbase` collection rather than as an app built around a
  custom runtime.
- Added a packaged canonical template under
  `assets/ops-registry-template/.ops/`.
- Simplified the canonical `item_state` schema so prose lives in the markdown
  body rather than frontmatter fields like `summary` and `notes`.
- Documented `mdbase-cli` as an optional companion tool for validation and
  queries, while keeping the workflow markdown-first and tool-optional.

### Removed

- Removed the old TypeScript CLI implementation.
- Removed the VS Code extension and its release workflow.
- Removed Node/package metadata and other prototype artifacts tied to the old
  package-oriented implementation.

### Result

- The repo is now the source of a skill plus a canonical `.ops` template.
- The primary install/use model is:
  1. Install or load the skill.
  2. Initialize `.ops/` from the packaged template.
  3. Maintain the registry directly as markdown backed by `mdbase`.
