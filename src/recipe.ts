import { parse as parseToml } from "@std/toml";
import { PackageManager } from "./detector.ts";
import { supportsVersioning } from "./backends/mod.ts";

const VALID_PACKAGE_MANAGERS = new Set(Object.values(PackageManager));

export interface InstallMethod {
  packageName?: string;
  tap?: string;
  cask?: boolean;
  script?: string;
  postInstall?: string;
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
    }
  >;
}

function validateRecipe(data: unknown): RawRecipe {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid recipe: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (!obj.package || typeof obj.package !== "object") {
    throw new Error("Invalid recipe: missing or invalid 'package' section");
  }

  const pkg = obj.package as Record<string, unknown>;

  if (typeof pkg.name !== "string" || pkg.name.trim() === "") {
    throw new Error("Invalid recipe: 'package.name' is required and must be a non-empty string");
  }

  if (pkg.description !== undefined && typeof pkg.description !== "string") {
    throw new Error("Invalid recipe: 'package.description' must be a string");
  }

  if (pkg.homepage !== undefined && typeof pkg.homepage !== "string") {
    throw new Error("Invalid recipe: 'package.homepage' must be a string");
  }

  if (pkg.verify_command !== undefined && typeof pkg.verify_command !== "string") {
    throw new Error("Invalid recipe: 'package.verify_command' must be a string");
  }

  if (pkg.verify_binary !== undefined && typeof pkg.verify_binary !== "string") {
    throw new Error("Invalid recipe: 'package.verify_binary' must be a string");
  }

  if (pkg.version_command !== undefined && typeof pkg.version_command !== "string") {
    throw new Error("Invalid recipe: 'package.version_command' must be a string");
  }

  if (obj.install !== undefined) {
    if (typeof obj.install !== "object" || obj.install === null) {
      throw new Error("Invalid recipe: 'install' must be an object");
    }

    for (const [key, method] of Object.entries(obj.install as Record<string, unknown>)) {
      if (!VALID_PACKAGE_MANAGERS.has(key as PackageManager)) {
        const valid = [...VALID_PACKAGE_MANAGERS].join(", ");
        throw new Error(`Invalid recipe: 'install.${key}' is not a valid package manager. Valid options: ${valid}`);
      }

      if (typeof method !== "object" || method === null) {
        throw new Error(`Invalid recipe: 'install.${key}' must be an object`);
      }

      const m = method as Record<string, unknown>;

      if (m.package_name !== undefined && typeof m.package_name !== "string") {
        throw new Error(`Invalid recipe: 'install.${key}.package_name' must be a string`);
      }

      if (m.tap !== undefined && typeof m.tap !== "string") {
        throw new Error(`Invalid recipe: 'install.${key}.tap' must be a string`);
      }

      if (m.cask !== undefined && typeof m.cask !== "boolean") {
        throw new Error(`Invalid recipe: 'install.${key}.cask' must be a boolean`);
      }

      if (m.script !== undefined && typeof m.script !== "string") {
        throw new Error(`Invalid recipe: 'install.${key}.script' must be a string`);
      }

      if (m.post_install !== undefined && typeof m.post_install !== "string") {
        throw new Error(`Invalid recipe: 'install.${key}.post_install' must be a string`);
      }
    }
  }

  return data as RawRecipe;
}

export function parseRecipeContent(content: string): Recipe {
  const parsed = parseToml(content);
  const raw = validateRecipe(parsed);

  const installMethods = new Map<string, InstallMethod>();
  if (raw.install) {
    for (const [key, value] of Object.entries(raw.install)) {
      installMethods.set(key, {
        packageName: value.package_name,
        tap: value.tap,
        cask: value.cask,
        script: value.script,
        postInstall: value.post_install,
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

export function loadRecipe(path: string): Recipe {
  const content = Deno.readTextFileSync(path);
  return parseRecipeContent(content);
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

/**
 * Returns all available installation methods for a recipe in priority order.
 * Used for fallback: if one method fails, try the next.
 *
 * When a version is specified, methods that support versioning are prioritized
 * over those that don't. This ensures version-pinned installations use backends
 * that can actually install the requested version.
 */
export function getInstallMethods(
  recipe: Recipe,
  availableManagers: PackageManager[],
  version?: string
): Array<[PackageManager, InstallMethod]> {
  const methods: Array<[PackageManager, InstallMethod]> = [];

  for (const manager of availableManagers) {
    const method = recipe.installMethods.get(manager);
    if (method) {
      methods.push([manager, method]);
    }
  }

  // When a version is specified, prioritize backends that support versioning
  if (version) {
    methods.sort((a, b) => {
      const aSupports = supportsVersioning(a[0]);
      const bSupports = supportsVersioning(b[0]);
      if (aSupports && !bSupports) return -1;
      if (!aSupports && bSupports) return 1;
      return 0; // Preserve original order within same category
    });
  }

  return methods;
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
