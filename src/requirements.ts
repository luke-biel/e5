import { parse as parseToml } from "@std/toml";

export interface Requirements {
  packages: string[];
}

export function parsePackageSpec(
  spec: string,
): { name: string; version?: string } {
  const atIndex = spec.lastIndexOf("@");
  if (atIndex > 0) {
    return {
      name: spec.substring(0, atIndex),
      version: spec.substring(atIndex + 1),
    };
  }
  return { name: spec };
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
