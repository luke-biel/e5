import { parse as parseToml } from "@std/toml";
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

function validateIndex(data: unknown): RepositoryIndex {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid index: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "string") {
    throw new Error("Invalid index: 'version' is required and must be a string");
  }

  if (!Array.isArray(obj.recipes)) {
    throw new Error("Invalid index: 'recipes' is required and must be an array");
  }

  for (let i = 0; i < obj.recipes.length; i++) {
    const entry = obj.recipes[i];

    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Invalid index: 'recipes[${i}]' must be an object`);
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.name !== "string" || e.name.trim() === "") {
      throw new Error(`Invalid index: 'recipes[${i}].name' is required and must be a non-empty string`);
    }

    if (e.description !== undefined && typeof e.description !== "string") {
      throw new Error(`Invalid index: 'recipes[${i}].description' must be a string`);
    }

    if (typeof e.file !== "string" || e.file.trim() === "") {
      throw new Error(`Invalid index: 'recipes[${i}].file' is required and must be a non-empty string`);
    }
  }

  return data as RepositoryIndex;
}

export class Repository {
  private index: RepositoryIndex | null = null;

  constructor(private config: RepositoryConfig) {}

  static getDefaultConfig(): RepositoryConfig {
    return {
      url:
        Deno.env.get("E5_REPO_URL") ||
        "https://raw.githubusercontent.com/luke-biel/e5/refs/heads/master/repo",
    };
  }

  async fetchIndex(): Promise<RepositoryIndex> {
    if (this.index) {
      return this.index;
    }

    const indexUrl = `${this.config.url}/index.toml`;
    let response: Response;
    try {
      response = await fetch(indexUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new Error(`Timeout fetching index from ${indexUrl}`);
      }
      throw e;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch index from ${indexUrl}: ${response.status}`);
    }

    const content = await response.text();
    const parsed = parseToml(content);
    this.index = validateIndex(parsed);
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
    let response: Response;
    try {
      response = await fetch(recipeUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        throw new Error(`Timeout fetching recipe ${name} from ${recipeUrl}`);
      }
      throw e;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch recipe ${name}: ${response.status}`);
    }

    const content = await response.text();
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
          r.description?.toLowerCase().includes(lowerQuery)
      ) || []
    );
  }

  getIndex(): RepositoryIndex | null {
    return this.index;
  }
}
