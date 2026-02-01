import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class NpmBackend implements Backend {
  name = "npm";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void> {
    const pkgName = method.packageName || packageName;
    const cmd = ["npm", "install"];

    if (method.global !== false) {
      cmd.push("-g");
    }

    cmd.push(pkgName);
    await runCommand(cmd, dryRun);
    await runPostInstall(method, dryRun);
  }

  async isInstalled(packageName: string): Promise<boolean> {
    try {
      const command = new Deno.Command("npm", {
        args: ["list", "-g", packageName],
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
