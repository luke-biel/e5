import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class AptBackend implements Backend {
  name = "apt";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void> {
    const pkgName = method.packageName || packageName;
    await runCommand(["sudo", "apt-get", "install", "-y", pkgName], dryRun);
    await runPostInstall(method, dryRun);
  }

  async isInstalled(packageName: string): Promise<boolean> {
    try {
      const command = new Deno.Command("dpkg", {
        args: ["-s", packageName],
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
