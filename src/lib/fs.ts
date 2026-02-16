import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, "utf8");
    return true;
  }
}

export async function writeFileForce(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}
