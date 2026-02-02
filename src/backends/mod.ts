import { PackageManager } from "../detector.ts";
import type { InstallMethod } from "../recipe.ts";
import { HomebrewBackend } from "./homebrew.ts";
import { AptBackend } from "./apt.ts";
import { PacmanBackend } from "./pacman.ts";
import { ScriptBackend } from "./script.ts";

export interface Backend {
  name: string;
  install(
    pkgName: string,
    method: InstallMethod,
    dryRun: boolean,
    version?: string
  ): Promise<void>;
}

/**
 * Returns whether a package manager supports version pinning.
 * - apt: Yes (package=version syntax)
 * - script: Yes (VERSION env variable)
 * - homebrew: No (uses versioned formula names instead)
 * - pacman: No (requires Arch Linux Archive)
 */
export function supportsVersioning(manager: PackageManager): boolean {
  switch (manager) {
    case PackageManager.Apt:
    case PackageManager.Script:
      return true;
    case PackageManager.Homebrew:
    case PackageManager.Pacman:
      return false;
  }
}

export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendError";
  }
}

export function getBackend(manager: PackageManager): Backend {
  switch (manager) {
    case PackageManager.Homebrew:
      return new HomebrewBackend();
    case PackageManager.Apt:
      return new AptBackend();
    case PackageManager.Pacman:
      return new PacmanBackend();
    case PackageManager.Script:
      return new ScriptBackend();
  }
}

export async function runCommand(
  cmd: string[],
  dryRun: boolean
): Promise<void> {
  const cmdStr = cmd.join(" ");

  if (dryRun) {
    console.log(`  Would run: ${cmdStr}`);
    return;
  }

  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();
  if (code !== 0) {
    throw new BackendError(`Command failed: ${cmdStr}`);
  }
}

export async function runPostInstall(
  method: InstallMethod,
  dryRun: boolean
): Promise<void> {
  if (!method.postInstall) return;

  if (dryRun) {
    console.log(`  Would run post-install: ${method.postInstall}`);
    return;
  }

  const command = new Deno.Command("sh", {
    args: ["-c", method.postInstall],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();
  if (code !== 0) {
    throw new BackendError("Post-install script failed");
  }
}
