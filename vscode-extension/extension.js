const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const vscode = require("vscode");

const execFileAsync = promisify(execFile);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shellQuote(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_\-./:=]+$/.test(raw)) {
    return raw;
  }
  return `'${raw.replaceAll("'", `'\\''`)}'`;
}

function ensureJsonFormat(args) {
  if (args.includes("--format")) {
    return args;
  }
  return [...args, "--format", "json"];
}

function firstWorkspaceFolder() {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0]
    : undefined;
}

function payloadWorkspaceFolder(payload) {
  if (payload && payload.workspaceFolder) return payload.workspaceFolder;
  if (payload && payload.opsWorkspaceFolder) return payload.opsWorkspaceFolder;
  return firstWorkspaceFolder();
}

async function pickWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    { title: "Select workspace folder for ops command" },
  );

  return picked ? picked.folder : undefined;
}

function createInfoTreeItem(label) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon("info");
  item.contextValue = "opsInfo";
  return item;
}

function createErrorTreeItem(label) {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon("error");
  item.contextValue = "opsError";
  return item;
}

class OpsClient {
  constructor(outputChannel) {
    this.outputChannel = outputChannel;
    this.terminal = undefined;
  }

  async runJson(args, workspaceFolder) {
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before running ops commands.");
    }

    const cwd = workspaceFolder.uri.fsPath;
    const finalArgs = ensureJsonFormat(args);
    this.outputChannel.appendLine(`$ ops ${finalArgs.map(shellQuote).join(" ")}`);

    try {
      const result = await execFileAsync("ops", finalArgs, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (result.stderr && result.stderr.trim().length > 0) {
        this.outputChannel.appendLine(result.stderr.trimEnd());
      }

      try {
        return JSON.parse(result.stdout);
      } catch {
        throw new Error(`ops returned non-JSON output: ${result.stdout.trim()}`);
      }
    } catch (error) {
      const details = [];
      if (error && typeof error === "object") {
        const err = error;
        if (typeof err.message === "string") details.push(err.message);
        if (typeof err.stdout === "string" && err.stdout.trim().length > 0) {
          details.push(`stdout: ${err.stdout.trim()}`);
        }
        if (typeof err.stderr === "string" && err.stderr.trim().length > 0) {
          details.push(`stderr: ${err.stderr.trim()}`);
        }
      }
      throw new Error(details.length > 0 ? details.join("\n") : String(error));
    }
  }

  runInteractive(args, workspaceFolder) {
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before running ops commands.");
    }

    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal("ops");
    }

    const commandText = `ops ${args.map(shellQuote).join(" ")}`;
    this.outputChannel.appendLine(`$ ${commandText}`);
    this.terminal.show(true);
    this.terminal.sendText(commandText, true);
  }
}

class CommandsProvider {
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    const workspaceFolder = firstWorkspaceFolder();
    if (!workspaceFolder) {
      return [createInfoTreeItem("Open a workspace folder")];
    }

    try {
      const commands = await this.client.runJson(["command", "list"], workspaceFolder);
      if (!Array.isArray(commands) || commands.length === 0) {
        return [createInfoTreeItem("No ops commands found")];
      }

      return commands.map((record) => {
        const fm = record && typeof record === "object" ? (record.frontmatter || {}) : {};
        const id = fm.id ? String(fm.id) : "unknown";
        const scope = fm.scope ? String(fm.scope) : "general";
        const active = fm.active !== false;
        const item = new vscode.TreeItem(id, vscode.TreeItemCollapsibleState.None);
        item.description = `${scope} ${active ? "active" : "inactive"}`;
        item.tooltip = fm.description ? String(fm.description) : id;
        item.contextValue = "opsCommand";
        item.iconPath = new vscode.ThemeIcon(active ? "rocket" : "circle-slash");
        item.opsWorkspaceFolder = workspaceFolder;
        item.opsRelativePath = record.path;
        item.command = {
          command: "opsExtension.openRelativeOpsFile",
          title: "Open command",
          arguments: [
            {
              workspaceFolder,
              relativePath: record.path,
            },
          ],
        };
        return item;
      });
    } catch (error) {
      return [createErrorTreeItem(String(error))];
    }
  }
}

class ItemsProvider {
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    const workspaceFolder = firstWorkspaceFolder();
    if (!workspaceFolder) {
      return [createInfoTreeItem("Open a workspace folder")];
    }

    try {
      const rows = await this.client.runJson(["item", "list"], workspaceFolder);
      if (!Array.isArray(rows) || rows.length === 0) {
        return [createInfoTreeItem("No item sidecars found")];
      }

      return rows.map((row) => {
        const fm = row && typeof row === "object" ? (row.frontmatter || {}) : {};
        const kind = String(fm.kind || "issue");
        const number = Number(fm.number || 0);
        const status = String(fm.local_status || "new");
        const priority = fm.priority ? ` [${String(fm.priority)}]` : "";
        const title = fm.remote_title ? String(fm.remote_title) : "";
        const item = new vscode.TreeItem(`${kind} #${number}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${status}${priority}`;
        item.tooltip = title || `${kind} #${number}`;
        item.contextValue = "opsItem";
        item.iconPath = new vscode.ThemeIcon(kind === "pr" ? "git-pull-request" : "issues");
        item.opsWorkspaceFolder = workspaceFolder;
        item.opsKind = kind;
        item.opsNumber = number;
        item.opsPath = row.path;
        item.command = {
          command: "opsExtension.openItemDetails",
          title: "Open item",
          arguments: [
            {
              workspaceFolder,
              kind,
              number,
              path: row.path,
            },
          ],
        };
        return item;
      });
    } catch (error) {
      return [createErrorTreeItem(String(error))];
    }
  }
}

class HandoffsProvider {
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    const workspaceFolder = firstWorkspaceFolder();
    if (!workspaceFolder) {
      return [createInfoTreeItem("Open a workspace folder")];
    }

    try {
      const rows = await this.client.runJson(["handoff", "list"], workspaceFolder);
      if (!Array.isArray(rows) || rows.length === 0) {
        return [createInfoTreeItem("No handoffs found")];
      }

      return rows.map((row) => {
        const fm = row && typeof row === "object" ? (row.frontmatter || {}) : {};
        const id = String(fm.id || "");
        const status = String(fm.status || "open");
        const target = String(fm.for_agent || "");
        const item = new vscode.TreeItem(id, vscode.TreeItemCollapsibleState.None);
        item.description = `${status}${target ? ` -> ${target}` : ""}`;
        item.tooltip = `item ${String(fm.item_id || "")}`;
        item.contextValue = "opsHandoff";
        item.iconPath = new vscode.ThemeIcon(status === "closed" ? "pass" : "arrow-swap");
        item.opsWorkspaceFolder = workspaceFolder;
        item.opsPath = row.path;
        item.command = {
          command: "opsExtension.openHandoffFile",
          title: "Open handoff",
          arguments: [
            {
              workspaceFolder,
              path: row.path,
            },
          ],
        };
        return item;
      });
    } catch (error) {
      return [createErrorTreeItem(String(error))];
    }
  }
}

class DiagnosticsRootItem extends vscode.TreeItem {
  constructor(kind, label, description, iconName) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.kind = kind;
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = "opsDiagnosticsRoot";
  }
}

class DiagnosticsProvider {
  constructor(client) {
    this.client = client;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.doctor = undefined;
    this.validate = undefined;
    this.error = undefined;
  }

  async refresh() {
    const workspaceFolder = firstWorkspaceFolder();
    if (!workspaceFolder) {
      this.doctor = undefined;
      this.validate = undefined;
      this.error = undefined;
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    try {
      const [doctor, validate] = await Promise.all([
        this.client.runJson(["doctor"], workspaceFolder),
        this.client.runJson(["command", "validate"], workspaceFolder),
      ]);
      this.doctor = doctor;
      this.validate = validate;
      this.error = undefined;
    } catch (error) {
      this.error = String(error);
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    const workspaceFolder = firstWorkspaceFolder();
    if (!workspaceFolder) {
      return [createInfoTreeItem("Open a workspace folder")];
    }

    if (this.error) {
      return [createErrorTreeItem(this.error)];
    }

    if (!element) {
      if (!this.doctor || !this.validate) {
        return [createInfoTreeItem("Loading diagnostics...")];
      }

      const checks = Array.isArray(this.doctor.checks) ? this.doctor.checks : [];
      const allChecksOk = checks.every((check) => check && check.ok === true);
      const issues = Array.isArray(this.validate.issues) ? this.validate.issues : [];
      const valid = this.validate.valid === true;

      return [
        new DiagnosticsRootItem(
          "doctor",
          "Doctor",
          `${allChecksOk ? "OK" : "FAIL"} (${checks.length} checks)`,
          allChecksOk ? "pass" : "error",
        ),
        new DiagnosticsRootItem(
          "validate",
          "Command Validation",
          valid ? "valid" : `${issues.length} issue(s)`,
          valid ? "pass" : "warning",
        ),
      ];
    }

    if (element.kind === "doctor") {
      const checks = Array.isArray(this.doctor && this.doctor.checks) ? this.doctor.checks : [];
      if (checks.length === 0) {
        return [createInfoTreeItem("No checks returned")];
      }
      return checks.map((check) => {
        const item = new vscode.TreeItem(String(check.check || "check"), vscode.TreeItemCollapsibleState.None);
        item.description = String(check.detail || "");
        item.iconPath = new vscode.ThemeIcon(check.ok ? "pass" : "error");
        item.contextValue = "opsDiagnosticsCheck";
        return item;
      });
    }

    if (element.kind === "validate") {
      const issues = Array.isArray(this.validate && this.validate.issues) ? this.validate.issues : [];
      if (issues.length === 0) {
        return [createInfoTreeItem("No validation issues")];
      }
      return issues.map((issue) => {
        const pathLabel = issue.path ? `${issue.path}: ` : "";
        const fieldLabel = issue.field ? `${issue.field}: ` : "";
        const message = `${pathLabel}${fieldLabel}${String(issue.message || "invalid")}`;
        const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
        item.description = issue.code ? `[${String(issue.code)}]` : "";
        item.iconPath = new vscode.ThemeIcon("warning");
        item.contextValue = "opsDiagnosticsIssue";
        return item;
      });
    }

    return [];
  }
}

function debounce(fn, delayMs) {
  let handle;
  return () => {
    if (handle) {
      clearTimeout(handle);
    }
    handle = setTimeout(() => {
      handle = undefined;
      fn();
    }, delayMs);
  };
}

async function promptNumber(title) {
  const input = await vscode.window.showInputBox({
    title,
    placeHolder: "123",
    validateInput: (value) => {
      const n = Number.parseInt(value, 10);
      return Number.isNaN(n) || n <= 0 ? "Enter a positive integer" : undefined;
    },
  });
  if (!input) {
    return undefined;
  }
  return Number.parseInt(input, 10);
}

async function pickItemTarget(prefill) {
  const prefillKind = prefill && (prefill.kind || prefill.opsKind);
  const prefillNumber = prefill && (prefill.number || prefill.opsNumber);
  if ((prefillKind === "issue" || prefillKind === "pr") && Number(prefillNumber) > 0) {
    return {
      kind: prefillKind,
      number: Number(prefillNumber),
      workspaceFolder: payloadWorkspaceFolder(prefill),
    };
  }

  const pickedKind = await vscode.window.showQuickPick(
    [
      { label: "Issue", kind: "issue" },
      { label: "Pull Request", kind: "pr" },
    ],
    { title: "Select item kind" },
  );
  if (!pickedKind) {
    return undefined;
  }

  const number = await promptNumber(`Enter ${pickedKind.kind} number`);
  if (!number) {
    return undefined;
  }

  const workspaceFolder = await pickWorkspaceFolder();
  if (!workspaceFolder) {
    return undefined;
  }

  return {
    kind: pickedKind.kind,
    number,
    workspaceFolder,
  };
}

async function openOpsRelativeFile(payload) {
  const workspaceFolder = payloadWorkspaceFolder(payload);
  if (!workspaceFolder) {
    throw new Error("Open a workspace folder before opening ops files.");
  }
  const relativePath = payload && (payload.relativePath || payload.opsRelativePath);
  if (!relativePath) {
    throw new Error("No ops relative path was provided.");
  }

  const fullPath = path.join(workspaceFolder.uri.fsPath, ".ops", String(relativePath));
  const uri = vscode.Uri.file(fullPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openHandoffFile(payload) {
  const workspaceFolder = payloadWorkspaceFolder(payload);
  if (!workspaceFolder) {
    throw new Error("Open a workspace folder before opening handoffs.");
  }
  const handoffPath = payload && (payload.path || payload.opsPath);
  if (!handoffPath) {
    throw new Error("No handoff path was provided.");
  }

  const fullPath = path.join(workspaceFolder.uri.fsPath, ".ops", String(handoffPath));
  const uri = vscode.Uri.file(fullPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openItemDetails(client, payload) {
  const target = await pickItemTarget(payload);
  if (!target) {
    return;
  }

  const args = ["item", "show", `--${target.kind}`, String(target.number)];
  const item = await client.runJson(args, target.workspaceFolder);

  const frontmatterEntries = Object.entries(item && item.frontmatter ? item.frontmatter : {});
  const frontmatterRows = frontmatterEntries
    .map(([key, value]) => {
      const renderedValue = Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value ?? "");
      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(renderedValue)}</td></tr>`;
    })
    .join("\n");

  const panel = vscode.window.createWebviewPanel(
    "opsItemDetails",
    `Ops ${target.kind} #${target.number}`,
    vscode.ViewColumn.Active,
    { enableFindWidget: true },
  );

  panel.webview.html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: var(--vscode-font-family); padding: 16px; line-height: 1.4; }
      h1 { font-size: 1.1rem; margin: 0 0 8px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; vertical-align: top; }
      th { width: 30%; }
      pre { white-space: pre-wrap; background: var(--vscode-editor-background); padding: 12px; border: 1px solid var(--vscode-panel-border); }
      .meta { color: var(--vscode-descriptionForeground); }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(item.path || `${target.kind}-${target.number}`)}</h1>
    <div class="meta">${escapeHtml(target.workspaceFolder.uri.fsPath)}</div>
    <table>
      <tbody>
        ${frontmatterRows}
      </tbody>
    </table>
    <h2>Body</h2>
    <pre>${escapeHtml(item && item.body ? item.body : "")}</pre>
  </body>
</html>`;
}

function registerCommand(context, id, callback) {
  context.subscriptions.push(vscode.commands.registerCommand(id, callback));
}

function activate(context) {
  const output = vscode.window.createOutputChannel("Ops");
  context.subscriptions.push(output);

  const client = new OpsClient(output);
  const commandsProvider = new CommandsProvider(client);
  const itemsProvider = new ItemsProvider(client);
  const handoffsProvider = new HandoffsProvider(client);
  const diagnosticsProvider = new DiagnosticsProvider(client);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("ops.commandsView", commandsProvider),
    vscode.window.registerTreeDataProvider("ops.itemsView", itemsProvider),
    vscode.window.registerTreeDataProvider("ops.handoffsView", handoffsProvider),
    vscode.window.registerTreeDataProvider("ops.diagnosticsView", diagnosticsProvider),
  );

  const refreshAll = async () => {
    commandsProvider.refresh();
    itemsProvider.refresh();
    handoffsProvider.refresh();
    await diagnosticsProvider.refresh();
  };

  const runSafe = async (fn) => {
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[error] ${message}`);
      vscode.window.showErrorMessage(message);
    }
  };

  registerCommand(context, "opsExtension.refresh", async () => {
    await runSafe(refreshAll);
  });

  registerCommand(context, "opsExtension.refreshDiagnostics", async () => {
    await runSafe(async () => {
      await diagnosticsProvider.refresh();
    });
  });

  registerCommand(context, "opsExtension.init", async () => {
    await runSafe(async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ops init",
        },
        () => client.runJson(["init"], workspaceFolder),
      );

      const created = Array.isArray(result.created) ? result.created.length : 0;
      vscode.window.showInformationMessage(`Initialized .ops (${created} file(s) created).`);
      await refreshAll();
    });
  });

  registerCommand(context, "opsExtension.doctor", async () => {
    await runSafe(async () => {
      const workspaceFolder = await pickWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const [doctor, validate] = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ops doctor",
        },
        async () => {
          return Promise.all([
            client.runJson(["doctor"], workspaceFolder),
            client.runJson(["command", "validate"], workspaceFolder),
          ]);
        },
      );

      output.appendLine(JSON.stringify({ doctor, validate }, null, 2));
      output.show(true);

      const checks = Array.isArray(doctor.checks) ? doctor.checks : [];
      const checkFailures = checks.filter((check) => !check.ok).length;
      const issues = Array.isArray(validate.issues) ? validate.issues : [];
      const summary = `Doctor: ${checks.length - checkFailures}/${checks.length} checks OK, validation: ${issues.length} issue(s).`;
      vscode.window.showInformationMessage(summary);

      await diagnosticsProvider.refresh();
    });
  });

  registerCommand(context, "opsExtension.ensureItemSidecar", async (payload) => {
    await runSafe(async () => {
      const target = await pickItemTarget(payload);
      if (!target) {
        return;
      }

      const repoOverride = await vscode.window.showInputBox({
        title: "Optional repo override (owner/repo)",
        placeHolder: "owner/repo",
      });

      const args = ["item", "ensure", `--${target.kind}`, String(target.number)];
      if (repoOverride && repoOverride.trim().length > 0) {
        args.push("--repo", repoOverride.trim());
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `ops item ensure ${target.kind} #${target.number}`,
        },
        () => client.runJson(args, target.workspaceFolder),
      );

      vscode.window.showInformationMessage(`Updated ${String(result.path || `${target.kind}-${target.number}`)}.`);
      await refreshAll();
    });
  });

  registerCommand(context, "opsExtension.triageIssue", async (payload) => {
    await runSafe(async () => {
      let issueNumber;
      let workspaceFolder;
      const payloadKind = payload && (payload.kind || payload.opsKind);
      const payloadNumber = payload && (payload.number || payload.opsNumber);
      if (payloadKind === "issue" && Number(payloadNumber) > 0) {
        issueNumber = Number(payloadNumber);
        workspaceFolder = payloadWorkspaceFolder(payload);
      } else {
        issueNumber = await promptNumber("Issue number to triage");
        workspaceFolder = await pickWorkspaceFolder();
      }

      if (!issueNumber || !workspaceFolder) {
        return;
      }

      client.runInteractive(["run", "triage-issue", "--issue", String(issueNumber), "--interactive"], workspaceFolder);
      vscode.window.showInformationMessage(`Started triage for issue #${issueNumber} in terminal.`);
    });
  });

  registerCommand(context, "opsExtension.reviewPr", async (payload) => {
    await runSafe(async () => {
      let prNumber;
      let workspaceFolder;
      const payloadKind = payload && (payload.kind || payload.opsKind);
      const payloadNumber = payload && (payload.number || payload.opsNumber);
      if (payloadKind === "pr" && Number(payloadNumber) > 0) {
        prNumber = Number(payloadNumber);
        workspaceFolder = payloadWorkspaceFolder(payload);
      } else {
        prNumber = await promptNumber("PR number to review");
        workspaceFolder = await pickWorkspaceFolder();
      }

      if (!prNumber || !workspaceFolder) {
        return;
      }

      client.runInteractive(["run", "review-pr", "--pr", String(prNumber), "--interactive"], workspaceFolder);
      vscode.window.showInformationMessage(`Started review for PR #${prNumber} in terminal.`);
    });
  });

  registerCommand(context, "opsExtension.createHandoff", async (payload) => {
    await runSafe(async () => {
      const target = await pickItemTarget(payload);
      if (!target) {
        return;
      }

      const forAgent = await vscode.window.showInputBox({
        title: "Handoff target (for-agent)",
        placeHolder: "codex",
        validateInput: (value) => (value.trim().length === 0 ? "This value is required" : undefined),
      });
      if (!forAgent) {
        return;
      }

      const nextStep = await vscode.window.showInputBox({
        title: "Optional next step",
        placeHolder: "Investigate failing test in CI",
      });

      const args = [
        "handoff",
        "create",
        `--${target.kind}`,
        String(target.number),
        "--for-agent",
        forAgent.trim(),
      ];

      if (nextStep && nextStep.trim().length > 0) {
        args.push("--next-step", nextStep.trim());
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `ops handoff create ${target.kind} #${target.number}`,
        },
        () => client.runJson(args, target.workspaceFolder),
      );

      vscode.window.showInformationMessage(`Created handoff ${String(result.id || "")}.`);
      await refreshAll();
    });
  });

  registerCommand(context, "opsExtension.openItemDetails", async (payload) => {
    await runSafe(async () => {
      await openItemDetails(client, payload);
    });
  });

  registerCommand(context, "opsExtension.openRelativeOpsFile", async (payload) => {
    await runSafe(async () => {
      await openOpsRelativeFile(payload);
    });
  });

  registerCommand(context, "opsExtension.openHandoffFile", async (payload) => {
    await runSafe(async () => {
      await openHandoffFile(payload);
    });
  });

  const refreshDebounced = debounce(() => {
    void refreshAll();
  }, 300);

  const watcherDisposables = [];

  const installWatchers = () => {
    for (const disposable of watcherDisposables.splice(0, watcherDisposables.length)) {
      disposable.dispose();
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const pattern = new vscode.RelativePattern(folder, ".ops/**/*");
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(refreshDebounced, undefined, context.subscriptions);
      watcher.onDidCreate(refreshDebounced, undefined, context.subscriptions);
      watcher.onDidDelete(refreshDebounced, undefined, context.subscriptions);
      watcherDisposables.push(watcher);
      context.subscriptions.push(watcher);
    }
  };

  installWatchers();
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      installWatchers();
      refreshDebounced();
    }),
  );

  void refreshAll();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
