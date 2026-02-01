import { parse as parseToml } from "@std/toml";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { Recipe, InstallMethod, PackageInfo } from "./recipe.ts";

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
  cacheDir: string;
}

export class Repository {
  private index: RepositoryIndex | null = null;

  constructor(private config: RepositoryConfig) {}

  static getDefaultConfig(): RepositoryConfig {
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    return {
      url:
        Deno.env.get("E5_REPO_URL") ||
        "https://raw.githubusercontent.com/example/e5-recipes/main",
      cacheDir: join(home, ".cache", "e5"),
    };
  }

  async fetchIndex(forceRefresh = false): Promise<RepositoryIndex> {
    const cacheFile = join(this.config.cacheDir, "index.json");

    if (!forceRefresh) {
      try {
        const cached = await this.loadCachedIndex(cacheFile);
        if (cached) {
          this.index = cached;
          return cached;
        }
      } catch {
        // Cache miss, fetch from remote
      }
    }

    const indexUrl = `${this.config.url}/index.json`;
    const response = await fetch(indexUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch index from ${indexUrl}: ${response.status}`);
    }

    const index = (await response.json()) as RepositoryIndex;
    this.index = index;

    // Cache the index
    await this.cacheIndex(cacheFile, index);

    return index;
  }

  private async loadCachedIndex(cacheFile: string): Promise<RepositoryIndex | null> {
    try {
      const stat = await Deno.stat(cacheFile);
      const age = Date.now() - (stat.mtime?.getTime() || 0);
      const maxAge = 3600 * 1000; // 1 hour

      if (age < maxAge) {
        const content = await Deno.readTextFile(cacheFile);
        return JSON.parse(content) as RepositoryIndex;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async cacheIndex(cacheFile: string, index: RepositoryIndex): Promise<void> {
    try {
      await ensureDir(this.config.cacheDir);
      await Deno.writeTextFile(cacheFile, JSON.stringify(index, null, 2));
    } catch {
      // Ignore cache write errors
    }
  }

  async fetchRecipe(name: string): Promise<Recipe> {
    // Check cache first
    const cacheFile = join(this.config.cacheDir, "recipes", `${name}.toml`);

    try {
      const content = await Deno.readTextFile(cacheFile);
      return this.parseRecipe(content);
    } catch {
      // Cache miss
    }

    // Fetch from remote
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
    const recipe = this.parseRecipe(content);

    // Cache the recipe
    await this.cacheRecipe(cacheFile, content);

    return recipe;
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

  private async cacheRecipe(cacheFile: string, content: string): Promise<void> {
    try {
      await ensureDir(join(this.config.cacheDir, "recipes"));
      await Deno.writeTextFile(cacheFile, content);
    } catch {
      // Ignore cache write errors
    }
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
