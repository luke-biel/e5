import { yellow } from "@std/fmt/colors";
import type { InstallMethod } from "../recipe.ts";
import type { Backend } from "./mod.ts";
import { runCommand, runPostInstall } from "./mod.ts";

export class HomebrewBackend implements Backend {
  name = "homebrew";

  async install(
    pkgName: string,
    method: InstallMethod,
    version?: string,
  ): Promise<void> {
    const name = method.pkgName || pkgName;

    // Homebrew doesn't support arbitrary version pinning.
    // Versioned formulae (e.g., node@18) are separate packages.
    if (version) {
      console.log(
        yellow(
          `  Warning: Homebrew does not support version pinning. Installing latest version of ${name}.`,
        ),
      );
      console.log(
        yellow(
          `  For versioned packages, use the versioned formula name (e.g., node@18) in the recipe.`,
        ),
      );
    }

    if (method.tap) {
      await runCommand(["brew", "tap", method.tap]);
    }

    const cmd = ["brew", "install"];
    if (method.cask) {
      cmd.push("--cask");
    }
    cmd.push(name);

    await runCommand(cmd);
    await runPostInstall(method);
  }
}
