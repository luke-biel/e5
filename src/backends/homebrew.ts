import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class HomebrewBackend implements Backend {
  name = "homebrew";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean,
    _version?: string
  ): Promise<void> {
    const pkgName = method.packageName || packageName;

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

  async isInstalled(packageName: string): Promise<boolean> {
    try {
      const command = new Deno.Command("brew", {
        args: ["list", packageName],
        stdout: "null",
        stderr: "null",
      });
      const { code } = await command.output();
      return code === 0;
    } catch {
      return false;
    }
  }
}
