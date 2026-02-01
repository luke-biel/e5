import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class PacmanBackend implements Backend {
  name = "pacman";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean,
    _version?: string
  ): Promise<void> {
    const pkgName = method.packageName || packageName;
    await runCommand(
      ["sudo", "pacman", "-S", "--noconfirm", pkgName],
      dryRun
    );
    await runPostInstall(method, dryRun);
  }

  async isInstalled(packageName: string): Promise<boolean> {
    try {
      const command = new Deno.Command("pacman", {
        args: ["-Q", packageName],
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
