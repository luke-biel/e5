import { yellow } from "@std/fmt/colors";
import type { InstallMethod } from "../recipe.ts";
import type { Backend } from "./mod.ts";
import { runCommand, runPostInstall } from "./mod.ts";

export class HomebrewBackend implements Backend {
  name = "homebrew";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean,
    version?: string
  ): Promise<void> {
    const pkgName = method.packageName || packageName;

    // Homebrew doesn't support arbitrary version pinning.
    // Versioned formulae (e.g., node@18) are separate packages.
    if (version) {
      console.log(
        yellow(`  Warning: Homebrew does not support version pinning. Installing latest version of ${pkgName}.`)
      );
      console.log(
        yellow(`  For versioned packages, use the versioned formula name (e.g., node@18) in the recipe.`)
      );
    }

    if (method.tap) {
      await runCommand(["brew", "tap", method.tap], dryRun);
    }

    const cmd = ["brew", "install"];
    if (method.cask) {
      cmd.push("--cask");
    }
    cmd.push(pkgName);

    await runCommand(cmd, dryRun);
    await runPostInstall(method, dryRun);
  }
}
