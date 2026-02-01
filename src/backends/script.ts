import { InstallMethod } from "../recipe.ts";
import { Backend, BackendError, runPostInstall } from "./mod.ts";

export class ScriptBackend implements Backend {
  name = "script";

  async install(
    packageName: string,
    method: InstallMethod,
    dryRun: boolean
  ): Promise<void> {
    if (!method.script) {
      throw new BackendError("No script provided for script installation");
    }

    if (dryRun) {
      console.log("  Would run script:");
      for (const line of method.script.split("\n")) {
        console.log(`    ${line}`);
      }
      return;
    }

    const command = new Deno.Command("sh", {
      args: ["-c", method.script],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const { code } = await command.output();
    if (code !== 0) {
      throw new BackendError(`Installation script for ${packageName} failed`);
    }

    await runPostInstall(method, dryRun);
  }

  async isInstalled(_packageName: string): Promise<boolean> {
    return false;
  }
}
