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
  versionCommand?: string;
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
    version_command?: string;
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
      versionCommand: raw.package.version_command,
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

export async function getInstalledVersion(recipe: Recipe): Promise<string | null> {
  const binary = recipe.package.verifyBinary || recipe.package.name;

  // Use custom version command if provided
  if (recipe.package.versionCommand) {
    try {
      const command = new Deno.Command("sh", {
        args: ["-c", recipe.package.versionCommand],
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code === 0) {
        const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
        return extractVersion(output);
      }
    } catch {
      return null;
    }
  }

  // Try common version flags
  const versionFlags = ["--version", "-V", "-v", "version"];
  for (const flag of versionFlags) {
    try {
      const command = new Deno.Command(binary, {
        args: [flag],
        stdout: "piped",
        stderr: "piped",
      });
      const { code, stdout, stderr } = await command.output();
      if (code === 0) {
        const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
        const version = extractVersion(output);
        if (version) {
          return version;
        }
      }
    } catch {
      // Try next flag
    }
  }

  return null;
}

function extractVersion(output: string): string | null {
  // Common version patterns:
  // "tool 1.2.3", "tool version 1.2.3", "v1.2.3", "1.2.3"
  const patterns = [
    /(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.]+)?)/,  // SemVer: 1.2.3, 1.2.3-beta, 1.2.3+build
    /(\d+\.\d+)/,  // Major.Minor: 1.2
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export interface VersionCheckResult {
  installed: boolean;
  installedVersion: string | null;
  versionMatch: boolean;
  requiredVersion: string | null;
}

export async function checkVersion(
  recipe: Recipe,
  requiredVersion?: string
): Promise<VersionCheckResult> {
  const installed = await isInstalled(recipe);
  if (!installed) {
    return {
      installed: false,
      installedVersion: null,
      versionMatch: false,
      requiredVersion: requiredVersion || null,
    };
  }

  const installedVersion = await getInstalledVersion(recipe);

  if (!requiredVersion) {
    return {
      installed: true,
      installedVersion,
      versionMatch: true,
      requiredVersion: null,
    };
  }

  const versionMatch = installedVersion !== null &&
    normalizeVersion(installedVersion) === normalizeVersion(requiredVersion);

  return {
    installed: true,
    installedVersion,
    versionMatch,
    requiredVersion,
  };
}

function normalizeVersion(version: string): string {
  // Remove leading 'v' if present
  return version.replace(/^v/, "").trim();
}
