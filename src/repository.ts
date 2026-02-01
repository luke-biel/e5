import { parse as parseToml } from "@std/toml";
import { Recipe, InstallMethod } from "./recipe.ts";

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

    const indexUrl = `${this.config.url}/index.json`;
    const response = await fetch(indexUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch index from ${indexUrl}: ${response.status}`);
    }

    this.index = (await response.json()) as RepositoryIndex;
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
    return this.parseRecipe(content);
  }

  private parseRecipe(content: string): Recipe {
    const raw = parseToml(content) as {
      package: {
        name: string;
        description?: string;
        homepage?: string;
        verify_command?: string;
        verify_binary?: string;
      };
      install?: Record<
        string,
        {
          package_name?: string;
          tap?: string;
          cask?: boolean;
          script?: string;
          post_install?: string;
          features?: string[];
          global?: boolean;
        }
      >;
    };

    const installMethods = new Map<string, InstallMethod>();
    if (raw.install) {
      for (const [key, value] of Object.entries(raw.install)) {
        installMethods.set(key, {
          packageName: value.package_name,
          tap: value.tap,
          cask: value.cask,
          script: value.script,
          postInstall: value.post_install,
          features: value.features,
          global: value.global ?? true,
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
      },
      installMethods,
    };
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
