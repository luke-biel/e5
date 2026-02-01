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
  osName: string,
  availableManagers: PackageManager[]
): [PackageManager, InstallMethod] | null {
  // Try OS-specific method first
  const osMethod = recipe.installMethods.get(osName);
  if (osMethod) {
    const manager = inferManager(osName, osMethod);
    if (
      manager &&
      (availableManagers.includes(manager) || manager === PackageManager.Script)
    ) {
      return [manager, osMethod];
    }
  }

  // Try available package managers
  for (const manager of availableManagers) {
    const method = recipe.installMethods.get(manager);
    if (method) {
      return [manager, method];
    }
  }

  // Fall back to script
  const scriptMethod = recipe.installMethods.get("script");
  if (scriptMethod) {
    return [PackageManager.Script, scriptMethod];
  }

  return null;
}

function inferManager(
  key: string,
  method: InstallMethod
): PackageManager | null {
  if (method.script) {
    return PackageManager.Script;
  }

  const mapping: Record<string, PackageManager> = {
    macos: PackageManager.Homebrew,
    homebrew: PackageManager.Homebrew,
    brew: PackageManager.Homebrew,
    ubuntu: PackageManager.Apt,
    debian: PackageManager.Apt,
    apt: PackageManager.Apt,
    arch: PackageManager.Pacman,
    pacman: PackageManager.Pacman,
    fedora: PackageManager.Dnf,
    dnf: PackageManager.Dnf,
    cargo: PackageManager.Cargo,
    npm: PackageManager.Npm,
    npx: PackageManager.Npm,
    pipx: PackageManager.Pipx,
    script: PackageManager.Script,
  };

  return mapping[key.toLowerCase()] || null;
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
