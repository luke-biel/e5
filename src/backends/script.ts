import type { InstallMethod } from "../recipe.ts";
import type { Backend } from "./mod.ts";
import { BackendError, runPostInstall } from "./mod.ts";

export class ScriptBackend implements Backend {
  name = "script";

  async install(
    pkgName: string,
    method: InstallMethod,
    version?: string,
  ): Promise<void> {
    if (!method.script) {
      throw new BackendError("No script provided for script installation");
    }

    const env: Record<string, string> = { ...Deno.env.toObject() };
    if (version) {
      env["VERSION"] = version;
    }

    const command = new Deno.Command("sh", {
      args: ["-c", method.script],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env,
    });

    const { code } = await command.output();
    if (code !== 0) {
      throw new BackendError(`Installation script for ${pkgName} failed`);
    }

    await runPostInstall(method);
  }
}
