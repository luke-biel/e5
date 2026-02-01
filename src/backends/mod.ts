import { PackageManager } from "../detector.ts";
import { InstallMethod } from "../recipe.ts";
import { HomebrewBackend } from "./homebrew.ts";
import { AptBackend } from "./apt.ts";
import { PacmanBackend } from "./pacman.ts";
import { CargoBackend } from "./cargo.ts";
import { NpmBackend } from "./npm.ts";
import { PipxBackend } from "./pipx.ts";
import { ScriptBackend } from "./script.ts";

export interface Backend {
  name: string;
  install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void>;
  isInstalled(packageName: string): Promise<boolean>;
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
    case PackageManager.Dnf:
      return new PacmanBackend();
    case PackageManager.Cargo:
      return new CargoBackend();
    case PackageManager.Npm:
      return new NpmBackend();
    case PackageManager.Pipx:
      return new PipxBackend();
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
