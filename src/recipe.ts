import { parse as parseToml } from "@std/toml";
import { PackageManager } from "./detector.ts";

export interface InstallMethod {
  packageName?: string;
  tap?: string;
  cask?: boolean;
  script?: string;
  postInstall?: string;
  features?: string[];
  global?: boolean;
}

export interface PackageInfo {
  name: string;
  description?: string;
  homepage?: string;
  verifyCommand?: string;
  verifyBinary?: string;
}

export interface Recipe {
  package: PackageInfo;
  installMethods: Map<string, InstallMethod>;
}

interface RawRecipe {
  package: {
    name: string;
    description?: string;
    homepage?: string;
    verify_command?: string;
    verify_binary?: string;
  };
  install?: Record<
    string,
    {
      package_name?: string;
      tap?: string;
      cask?: boolean;
      script?: string;
      post_install?: string;
      features?: string[];
      global?: boolean;
    }
  >;
}

export function loadRecipe(path: string): Recipe {
  const content = Deno.readTextFileSync(path);
  const raw = parseToml(content) as unknown as RawRecipe;

  const installMethods = new Map<string, InstallMethod>();
  if (raw.install) {
    for (const [key, value] of Object.entries(raw.install)) {
      installMethods.set(key, {
        packageName: value.package_name,
        tap: value.tap,
        cask: value.cask,
        script: value.script,
        postInstall: value.post_install,
        features: value.features,
        global: value.global ?? true,
      });
    }
  }

  return {
    package: {
      name: raw.package.name,
      description: raw.package.description,
      homepage: raw.package.homepage,
      verifyCommand: raw.package.verify_command,
      verifyBinary: raw.package.verify_binary,
    },
    installMethods,
  };
}

export function getInstallMethod(
  recipe: Recipe,
  availableManagers: PackageManager[]
): [PackageManager, InstallMethod] | null {
  for (const manager of availableManagers) {
    const method = recipe.installMethods.get(manager);
    if (method) {
      return [manager, method];
    }
  }

  return null;
}

export async function isInstalled(recipe: Recipe): Promise<boolean> {
  if (recipe.package.verifyCommand) {
    try {
      const command = new Deno.Command("sh", {
        args: ["-c", recipe.package.verifyCommand],
        stdout: "null",
        stderr: "null",
      });
      const { code } = await command.output();
      return code === 0;
    } catch {
      return false;
    }
  }

  const binary = recipe.package.verifyBinary || recipe.package.name;
  try {
    const command = new Deno.Command("which", {
      args: [binary],
      stdout: "null",
      stderr: "null",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}
