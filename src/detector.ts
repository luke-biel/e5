export enum PackageManager {
  Homebrew = "homebrew",
  Apt = "apt",
  Pacman = "pacman",
  Script = "script",
}

// Native package managers (platform-specific, highest priority)
const NATIVE_MANAGERS: PackageManager[] = [
  PackageManager.Apt,
  PackageManager.Pacman,
];

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const command = new Deno.Command("which", {
      args: [cmd],
      stdout: "null",
      stderr: "null",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

export interface Environment {
  availableManagers: PackageManager[];
}

/**
 * Detects available package managers and returns them in fallback priority order:
 * 1. Native package managers (apt, pacman) - highest priority
 * 2. Homebrew (cross-platform)
 * 3. Script (universal fallback)
 */
export async function detectEnvironment(): Promise<Environment> {
  const managerCommands: Map<PackageManager, string | null> = new Map([
    [PackageManager.Apt, "apt"],
    [PackageManager.Pacman, "pacman"],
    [PackageManager.Homebrew, "brew"],
    [PackageManager.Script, null], // Always available
  ]);

  const availableManagers: PackageManager[] = [];

  // First, add native package managers in order
  for (const nativeManager of NATIVE_MANAGERS) {
    const cmd = managerCommands.get(nativeManager);
    if (cmd && (await commandExists(cmd))) {
      availableManagers.push(nativeManager);
    }
  }

  // Then add Homebrew (cross-platform fallback)
  if (await commandExists("brew")) {
    availableManagers.push(PackageManager.Homebrew);
  }

  // Script is always available as final fallback
  availableManagers.push(PackageManager.Script);

  return { availableManagers };
}
