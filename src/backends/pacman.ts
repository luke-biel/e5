import { yellow } from "@std/fmt/colors";
import type { InstallMethod } from "../recipe.ts";
import type { Backend } from "./mod.ts";
import { runCommand, runPostInstall } from "./mod.ts";

export class PacmanBackend implements Backend {
  name = "pacman";
  private static cacheUpdated = false;

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean,
    version?: string
  ): Promise<void> {
    // Sync package database before first install
    if (!PacmanBackend.cacheUpdated) {
      await runCommand(["sudo", "pacman", "-Sy"], dryRun);
      PacmanBackend.cacheUpdated = true;
    }

    const pkgName = method.packageName || packageName;

    // Pacman doesn't support version pinning directly.
    // Would require using Arch Linux Archive or downgrade utility.
    if (version) {
      console.log(
        yellow(`  Warning: Pacman does not support version pinning. Installing latest version of ${pkgName}.`)
      );
      console.log(
        yellow(`  For specific versions, use a script backend with the Arch Linux Archive.`)
      );
    }

    await runCommand(
      ["sudo", "pacman", "-S", "--noconfirm", pkgName],
      dryRun
    );
    await runPostInstall(method, dryRun);
  }
}
