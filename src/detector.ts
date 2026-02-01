export enum PackageManager {
  Homebrew = "homebrew",
  Apt = "apt",
  Pacman = "pacman",
  Script = "script",
}

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

export async function detectEnvironment(): Promise<Environment> {
  const managerCommands: [PackageManager, string | null][] = [
    [PackageManager.Homebrew, "brew"],
    [PackageManager.Apt, "apt"],
    [PackageManager.Pacman, "pacman"],
    [PackageManager.Script, null],
  ];

  const availableManagers: PackageManager[] = [];

  for (const [manager, cmd] of managerCommands) {
    if (cmd === null || (await commandExists(cmd))) {
      availableManagers.push(manager);
    }
  }

  return { availableManagers };
}
