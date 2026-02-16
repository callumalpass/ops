import { execCapture } from "../process.js";

function trimDotGit(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

export async function originUrl(cwd: string): Promise<string> {
  const result = await execCapture("git", ["config", "--get", "remote.origin.url"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`git remote.origin.url lookup failed: ${result.stderr || result.stdout}`);
  }
  const url = result.stdout.trim();
  if (!url) {
    throw new Error("git remote.origin.url is empty.");
  }
  return url;
}

export function parseGitHubRepo(url: string): string | undefined {
  const cleaned = trimDotGit(url.trim());
  const httpsMatch = cleaned.match(/github\.com[/:](.+)$/i);
  if (httpsMatch?.[1]) return httpsMatch[1];
  return undefined;
}

export function parseGitLabRepo(url: string): string | undefined {
  const cleaned = trimDotGit(url.trim());
  const httpsMatch = cleaned.match(/gitlab\.com[/:](.+)$/i);
  if (httpsMatch?.[1]) return httpsMatch[1];
  return undefined;
}

export function parseAzureRepo(url: string): { organization: string; project: string; repository: string } | undefined {
  const cleaned = trimDotGit(url.trim());

  // https://dev.azure.com/org/project/_git/repo
  const httpsMatch = cleaned.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)$/i);
  if (httpsMatch) {
    return {
      organization: httpsMatch[1],
      project: httpsMatch[2],
      repository: httpsMatch[3],
    };
  }

  // git@ssh.dev.azure.com:v3/org/project/repo
  const sshMatch = cleaned.match(/ssh\.dev\.azure\.com[:/]v3\/([^/]+)\/([^/]+)\/([^/]+)$/i);
  if (sshMatch) {
    return {
      organization: sshMatch[1],
      project: sshMatch[2],
      repository: sshMatch[3],
    };
  }

  return undefined;
}
