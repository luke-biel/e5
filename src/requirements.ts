import { parse as parseToml, stringify as stringifyToml } from "@std/toml";

export interface Requirements {
  packages: string[];
}

export function loadRequirements(path: string): Requirements {
  try {
    const content = Deno.readTextFileSync(path);
    const data = parseToml(content) as { packages?: string[] };
    return {
      packages: data.packages || [],
    };
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return { packages: [] };
    }
    throw e;
  }
}

export function saveRequirements(path: string, requirements: Requirements): void {
  const content = stringifyToml({ packages: requirements.packages });
  Deno.writeTextFileSync(path, content);
}

export function addPackage(requirements: Requirements, packageName: string): boolean {
  if (requirements.packages.includes(packageName)) {
    return false;
  }
  requirements.packages.push(packageName);
  requirements.packages.sort();
  return true;
}

export function removePackage(requirements: Requirements, packageName: string): boolean {
  const index = requirements.packages.indexOf(packageName);
  if (index === -1) {
    return false;
  }
  requirements.packages.splice(index, 1);
  return true;
}
