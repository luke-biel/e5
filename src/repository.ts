import { parse as parseToml } from "@std/toml";
import { fromFileUrl } from "@std/path";
import type { Recipe } from "./recipe.ts";
import { parseRecipeContent } from "./recipe.ts";

export interface IndexEntry {
  name: string;
  description?: string;
  file: string;
}

export interface RepositoryIndex {
  version: string;
  recipes: IndexEntry[];
}

export interface RepositoryConfig {
  url: string;
}

const FETCH_TIMEOUT_MS = 30000; // 30 seconds

function isFileUrl(url: string): boolean {
  return url.startsWith("file://");
}

/**
 * Fetches text content from a URL, supporting both HTTP(S) and file:// schemes.
 * For file:// URLs, reads directly from the local filesystem.
 * For HTTP(S) URLs, performs a fetch with timeout handling.
 */
async function fetchContent(url: string): Promise<string> {
  if (isFileUrl(url)) {
    const filePath = fromFileUrl(url);
    try {
      return await Deno.readTextFile(filePath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw e;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(`Timeout fetching from ${url}`);
    }
    throw e;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}: ${response.status}`);
  }

  return await response.text();
}

/**
 * Parses TOML content and validates it against the repository index schema.
 */
function parseIndexContent(content: string): RepositoryIndex {
  const parsed = parseToml(content);
  return validateIndex(parsed);
}

/**
 * Validates parsed TOML data against the repository index schema.
 * Ensures version field and recipes array exist with correct structure.
 * Throws descriptive errors for invalid input.
 */
function validateIndex(data: unknown): RepositoryIndex {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid index: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "string") {
    throw new Error(
      "Invalid index: 'version' is required and must be a string",
    );
  }

  if (!Array.isArray(obj.recipes)) {
    throw new Error(
      "Invalid index: 'recipes' is required and must be an array",
    );
  }

  for (let i = 0; i < obj.recipes.length; i++) {
    const entry = obj.recipes[i];

    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Invalid index: 'recipes[${i}]' must be an object`);
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.name !== "string" || e.name.trim() === "") {
      throw new Error(
        `Invalid index: 'recipes[${i}].name' is required and must be a non-empty string`,
      );
    }

    if (e.description !== undefined && typeof e.description !== "string") {
      throw new Error(
        `Invalid index: 'recipes[${i}].description' must be a string`,
      );
    }

    if (typeof e.file !== "string" || e.file.trim() === "") {
      throw new Error(
        `Invalid index: 'recipes[${i}].file' is required and must be a non-empty string`,
      );
    }
  }

  return data as RepositoryIndex;
}

export class Repository {
  private index: RepositoryIndex | null = null;

  constructor(private config: RepositoryConfig) {}

  static getDefaultConfig(): RepositoryConfig {
    return {
      url: Deno.env.get("E5_REPO_URL") ||
        "https://raw.githubusercontent.com/luke-biel/e5/refs/heads/master/repo",
    };
  }

  async fetchIndex(): Promise<RepositoryIndex> {
    if (this.index) {
      return this.index;
    }

    const indexUrl = `${this.config.url}/index.toml`;
    const content = await fetchContent(indexUrl);
    this.index = parseIndexContent(content);
    return this.index;
  }

  async fetchRecipe(name: string): Promise<Recipe> {
    if (!this.index) {
      await this.fetchIndex();
    }

    const entry = this.index?.recipes.find((r) => r.name === name);
    if (!entry) {
      throw new Error(`Recipe not found in index: ${name}`);
    }

    const recipeUrl = `${this.config.url}/${entry.file}`;
    const content = await fetchContent(recipeUrl);
    return parseRecipeContent(content);
  }

  async search(query: string): Promise<IndexEntry[]> {
    if (!this.index) {
      await this.fetchIndex();
    }

    const lowerQuery = query.toLowerCase();
    return (
      this.index?.recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(lowerQuery) ||
          r.description?.toLowerCase().includes(lowerQuery),
      ) || []
    );
  }

  getIndex(): RepositoryIndex | null {
    return this.index;
  }
}
