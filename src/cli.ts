#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "node:module";
import { registerInit } from "./commands/init.js";
import { registerCommandCommands } from "./commands/command.js";
import { registerItemCommands } from "./commands/item.js";
import { registerRun } from "./commands/run.js";
import { registerTriage } from "./commands/triage.js";
import { registerIssue } from "./commands/issue.js";
import { registerTask } from "./commands/task.js";
import { registerHandoff } from "./commands/handoff.js";
import { registerDoctor } from "./commands/doctor.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

const program = new Command();
program
  .name("ops")
  .description("Markdown-native operations CLI for software delivery providers and AI agents")
  .version(pkg.version ?? "0.0.0");

registerInit(program);
registerCommandCommands(program);
registerItemCommands(program);
registerRun(program);
registerTriage(program);
registerIssue(program);
registerTask(program);
registerHandoff(program);
registerDoctor(program);

await program.parseAsync();
