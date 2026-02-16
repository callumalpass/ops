import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");

await fs.mkdir(outDir, { recursive: true });
await fs.copyFile(path.join(root, "extension.js"), path.join(outDir, "extension.js"));

console.log("Built extension to dist/extension.js");
