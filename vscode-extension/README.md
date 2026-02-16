# Ops VS Code Extension

This extension wraps the `ops` CLI and provides:

- Activity Bar panel with `Commands`, `Items`, `Handoffs`, and `Diagnostics`
- Command Palette actions for common workflows
- Interactive triage/review execution in a VS Code terminal
- JSON-backed refresh from `ops` commands

## Requirements

- `ops` available on your `PATH`
- A workspace folder with a repository root
- `gh` auth configured when using issue/PR-backed commands

If `ops` is not on your shell `PATH`, set `opsExtension.cliPath` in VS Code settings to the CLI executable path (or a `cli.js` path). Relative paths are resolved from the workspace root.

## Commands

- `Ops: Initialize (.ops)`
- `Ops: Doctor`
- `Ops: Ensure Item Sidecar`
- `Ops: Triage Issue`
- `Ops: Review PR`
- `Ops: Create Handoff`
- `Ops: Refresh`

## Development

1. Install extension dev deps:
   - `npm install`
2. Build the extension entrypoint:
   - `npm run build`
3. Launch an Extension Development Host:
   - open this `vscode-extension/` folder in VS Code and press `F5`

## Packaging

- Create a `.vsix` artifact:
  - `npm run package`

The generated `.vsix` can be installed with:

- VS Code UI: `Extensions` -> `...` -> `Install from VSIX...`
- CLI: `code --install-extension <path-to.vsix>`

## Publish

- Visual Studio Marketplace:
  - `npm run publish:marketplace`
- Open VSX Registry:
  - `npm run publish:openvsx`
