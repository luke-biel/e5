import { InstallMethod } from "../recipe.ts";
import { Backend, runCommand, runPostInstall } from "./mod.ts";

export class CargoBackend implements Backend {
  name = "cargo";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void> {
    const pkgName = method.packageName || packageName;
    const cmd = ["cargo", "install"];

    if (method.features && method.features.length > 0) {
      cmd.push("--features", method.features.join(","));
    }

    cmd.push(pkgName);
    await runCommand(cmd, dryRun);
    await runPostInstall(method, dryRun);
  }

  async isInstalled(packageName: string): Promise<boolean> {
    const home = Deno.env.get("HOME") || "";
    const cargoBin = `${home}/.cargo/bin/${packageName}`;

    try {
      Deno.statSync(cargoBin);
      return true;
    } catch {
      // Fall back to which
      try {
        const command = new Deno.Command("which", {
          args: [packageName],
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
}
