import { Collection } from "@callumalpass/mdbase";
import path from "node:path";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(lockPath: string): void {
  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // Lock file exists — check for staleness.
    try {
      const pid = parseInt(readFileSync(lockPath, "utf8").trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid)) {
        throw new Error(
          `Another ops process (PID ${pid}) holds the lock. ` +
            `If this is stale, remove ${lockPath} manually.`,
        );
      }
    } catch (readErr: unknown) {
      if (readErr instanceof Error && readErr.message.includes("Another ops")) throw readErr;
      // File disappeared or unreadable — retry below.
    }
    // Stale or vanished — remove and retry once.
    try { unlinkSync(lockPath); } catch { /* ignore */ }
    try {
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch {
      throw new Error(`Failed to acquire ops lock at ${lockPath}.`);
    }
  }
}

function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}

export async function openCollection(collectionPath: string): Promise<Collection> {
  const opened = await Collection.open(collectionPath);
  if (opened.error || !opened.collection) {
    throw new Error(opened.error?.message ?? `Failed to open collection at ${collectionPath}`);
  }
  return opened.collection;
}

export async function withCollection<T>(collectionPath: string, fn: (collection: Collection) => Promise<T>): Promise<T> {
  const lockPath = path.join(collectionPath, ".lock");
  acquireLock(lockPath);

  const cleanup = () => {
    releaseLock(lockPath);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    const collection = await openCollection(collectionPath);
    try {
      return await fn(collection);
    } finally {
      await collection.close();
    }
  } finally {
    process.off("SIGINT", cleanup);
    process.off("SIGTERM", cleanup);
    releaseLock(lockPath);
  }
}
