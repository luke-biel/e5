import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class PipxBackend implements Backend {
  name = "pipx";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void> {
    const pkgName = method.packageName || packageName;
    await runCommand(["pipx", "install", pkgName], dryRun);
    await runPostInstall(method, dryRun);
  }

  async isInstalled(packageName: string): Promise<boolean> {
    try {
      const command = new Deno.Command("pipx", {
        args: ["list", "--short"],
        stdout: "piped",
        stderr: "null",
      });
      const { stdout } = await command.output();
      const output = new TextDecoder().decode(stdout);
      return output.includes(packageName);
    } catch {
      return false;
    }
  }
}
