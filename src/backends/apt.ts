import type { InstallMethod } from "../recipe.ts";
import type { Backend } from "./mod.ts";
import { runCommand, runPostInstall } from "./mod.ts";

export class AptBackend implements Backend {
  name = "apt";
  private static cacheUpdated = false;

  async install(
    pkgName: string,
    method: InstallMethod,
    dryRun: boolean,
    version?: string,
  ): Promise<void> {
    // Update package cache before first install
    if (!AptBackend.cacheUpdated) {
      await runCommand(["sudo", "apt-get", "update"], dryRun);
      AptBackend.cacheUpdated = true;
    }

    let pkgSpec = method.pkgName || pkgName;

    // APT supports version pinning with package=version syntax
    if (version) {
      pkgSpec = `${pkgSpec}=${version}`;
    }

    await runCommand(["sudo", "apt-get", "install", "-y", pkgSpec], dryRun);
    await runPostInstall(method, dryRun);
  }
}
