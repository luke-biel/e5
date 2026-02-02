import { parse as parseToml } from "@std/toml";

export interface Requirements {
  packages: string[];
}

/**
 * Parses a package specification string into name and optional version.
 * Uses the last '@' as delimiter to support scoped-style names.
 *
 * @example
 * parsePackageSpec("taplo@0.9.3") // { name: "taplo", version: "0.9.3" }
 * parsePackageSpec("hurl")        // { name: "hurl" }
 */
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

/**
 * Validates parsed TOML data against the requirements schema.
 * Ensures packages field is an array of non-empty strings if present.
 * Throws descriptive errors for invalid input.
 */
function validateRequirements(data: unknown): Requirements {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid requirements: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.packages === undefined) {
    return { packages: [] };
  }

  if (!Array.isArray(obj.packages)) {
    throw new Error("Invalid requirements: 'packages' must be an array");
  }

  for (let i = 0; i < obj.packages.length; i++) {
    const pkg = obj.packages[i];
    if (typeof pkg !== "string" || pkg.trim() === "") {
      throw new Error(
        `Invalid requirements: 'packages[${i}]' must be a non-empty string`,
      );
    }
  }

  return { packages: obj.packages as string[] };
}

/**
 * Parses TOML content and validates it against the requirements schema.
 */
function parseRequirementsContent(content: string): Requirements {
  const parsed = parseToml(content);
  return validateRequirements(parsed);
}

export function loadRequirements(path: string): Requirements {
  try {
    const content = Deno.readTextFileSync(path);
    return parseRequirementsContent(content);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return { packages: [] };
    }
    throw e;
  }
}
