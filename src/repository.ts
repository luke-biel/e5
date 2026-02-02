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
    const response = await fetch(indexUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch index from ${indexUrl}: ${response.status}`);
    }

    const content = await response.text();
    this.index = parseToml(content) as unknown as RepositoryIndex;
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
    const response = await fetch(recipeUrl);

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
