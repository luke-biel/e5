export enum Os {
  MacOS = "macos",
  Ubuntu = "ubuntu",
  Debian = "debian",
  Arch = "arch",
  Fedora = "fedora",
  Unknown = "unknown",
}

export enum PackageManager {
  Homebrew = "homebrew",
  Apt = "apt",
  Pacman = "pacman",
  Dnf = "dnf",
  Cargo = "cargo",
  Npm = "npm",
  Pipx = "pipx",
  Script = "script",
}

function detectOs(): Os {
  const os = Deno.build.os;

  if (os === "darwin") {
    return Os.MacOS;
  }

  if (os === "linux") {
    return detectLinuxDistro();
  }

  return Os.Unknown;
}

function detectLinuxDistro(): Os {
  try {
    const content = Deno.readTextFileSync("/etc/os-release");
    const info: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const idx = line.indexOf("=");
      if (idx !== -1) {
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1).replace(/"/g, "");
        info[key] = value;
      }
    }

    const id = (info["ID"] || "").toLowerCase();

    switch (id) {
      case "ubuntu":
        return Os.Ubuntu;
      case "debian":
        return Os.Debian;
      case "arch":
      case "archlinux":
      case "endeavouros":
      case "manjaro":
        return Os.Arch;
      case "fedora":
        return Os.Fedora;
    }

    const idLike = (info["ID_LIKE"] || "").toLowerCase();
    if (idLike.includes("ubuntu") || idLike.includes("debian")) {
      return Os.Ubuntu;
    }
    if (idLike.includes("arch")) {
      return Os.Arch;
    }
    if (idLike.includes("fedora")) {
      return Os.Fedora;
    }
  } catch {
    // Ignore errors
  }

  return Os.Unknown;
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

export function getDefaultManager(os: Os): PackageManager | null {
  switch (os) {
    case Os.MacOS:
      return PackageManager.Homebrew;
    case Os.Ubuntu:
    case Os.Debian:
      return PackageManager.Apt;
    case Os.Arch:
      return PackageManager.Pacman;
    case Os.Fedora:
      return PackageManager.Dnf;
    default:
      return null;
  }
}

export interface Environment {
  os: Os;
  availableManagers: PackageManager[];
  defaultManager: PackageManager | null;
}

export async function detectEnvironment(): Promise<Environment> {
  const os = detectOs();

  const managerCommands: [PackageManager, string | null][] = [
    [PackageManager.Homebrew, "brew"],
    [PackageManager.Apt, "apt"],
    [PackageManager.Pacman, "pacman"],
    [PackageManager.Dnf, "dnf"],
    [PackageManager.Cargo, "cargo"],
    [PackageManager.Npm, "npm"],
    [PackageManager.Pipx, "pipx"],
    [PackageManager.Script, null],
  ];

  const availableManagers: PackageManager[] = [];

  for (const [manager, cmd] of managerCommands) {
    if (cmd === null || (await commandExists(cmd))) {
      availableManagers.push(manager);
    }
  }

  return {
    os,
    availableManagers,
    defaultManager: getDefaultManager(os),
  };
}
