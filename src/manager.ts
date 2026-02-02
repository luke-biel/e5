import { bold, cyan, dim, green, red, yellow } from "@std/fmt/colors";
import type { Environment } from "./detector.ts";
import { detectEnvironment } from "./detector.ts";
import type { Recipe } from "./recipe.ts";
import { getInstallMethod, getInstallMethods } from "./recipe.ts";
import { getBackend } from "./backends/mod.ts";
import { Repository, type RepositoryConfig } from "./repository.ts";
import type { Requirements } from "./requirements.ts";
import { loadRequirements, parsePackageSpec } from "./requirements.ts";

export class Manager {
  private recipes: Map<string, Recipe> = new Map();

  private constructor(
    private requirementsPath: string,
    private requirements: Requirements,
    private repository: Repository,
    private env: Environment,
  ) {}

  /**
   * Check if a package name is in requirements.
   * Handles versioned specs like "taplo@0.9.3" correctly.
   */
  private isInRequirements(pkgName: string): boolean {
    return this.requirements.packages.some(
      (spec) => parsePackageSpec(spec).name === pkgName,
    );
  }

  static async create(
    requirementsPath: string,
    repoConfig?: Partial<RepositoryConfig>,
  ): Promise<Manager> {
    const requirements = loadRequirements(requirementsPath);
    const defaultConfig = Repository.getDefaultConfig();
    const config = { ...defaultConfig, ...repoConfig };
    const repository = new Repository(config);
    const env = await detectEnvironment();

    return new Manager(requirementsPath, requirements, repository, env);
  }

  listRequired() {
    console.log(bold("Required packages:"));
    console.log();

    if (this.requirements.packages.length === 0) {
      console.log(dim("  No packages in requirements.toml"));
      console.log(dim("  Add packages to requirements.toml and run 'e5 sync'"));
      return;
    }

    for (const spec of this.requirements.packages.sort()) {
      console.log(`  ${cyan(spec)}`);
    }

    console.log();
    console.log(
      `${bold("Total:")} ${this.requirements.packages.length} package(s)`,
    );
  }

  private async getRecipe(name: string): Promise<Recipe> {
    if (!this.recipes.has(name)) {
      const recipe = await this.repository.fetchRecipe(name);
      this.recipes.set(name, recipe);
    }
    return this.recipes.get(name)!;
  }

  async search(query: string): Promise<void> {
    console.log(bold(`Searching for "${query}"...`));
    console.log();

    const results = await this.repository.search(query);

    if (results.length === 0) {
      console.log(dim("  No packages found"));
      return;
    }

    for (const entry of results) {
      const inReqs = this.isInRequirements(entry.name);
      const marker = inReqs ? green(" [required]") : "";
      const desc = entry.description ? ` - ${entry.description}` : "";
      console.log(`  ${cyan(entry.name)}${marker}${desc}`);
    }
  }

  async listAvailable(): Promise<void> {
    console.log(bold("Available packages in repository:"));
    console.log();

    const index = await this.repository.fetchIndex();

    for (
      const entry of index.recipes.sort((a, b) => a.name.localeCompare(b.name))
    ) {
      const inReqs = this.isInRequirements(entry.name);
      const marker = inReqs ? green(" [required]") : "";
      const desc = entry.description ? ` - ${entry.description}` : "";
      console.log(`  ${cyan(entry.name)}${marker}${desc}`);
    }
  }

  async show(pkgSpec: string): Promise<void> {
    const { name: pkgName, version } = parsePackageSpec(pkgSpec);
    const recipe = await this.getRecipe(pkgName);

    console.log(`${bold("Package:")} ${cyan(recipe.package.name)}`);

    if (recipe.package.description) {
      console.log(`${bold("Description:")} ${recipe.package.description}`);
    }

    if (recipe.package.homepage) {
      console.log(`${bold("Homepage:")} ${recipe.package.homepage}`);
    }

    const inReqs = this.isInRequirements(pkgName);
    console.log(
      `${bold("In requirements:")} ${inReqs ? green("yes") : yellow("no")}`,
    );

    console.log();
    console.log(bold("Installation methods:"));
    for (const [key, method] of recipe.installMethods) {
      const name = method.pkgName || recipe.package.name;
      if (method.script) {
        console.log(`  ${yellow(key)}: <script>`);
      } else {
        console.log(`  ${yellow(key)}: ${name}`);
      }
    }

    console.log();
    console.log(bold("Available tools:"));
    console.log(`  ${cyan(this.env.availableManagers.join(", "))}`);

    const methods = getInstallMethods(
      recipe,
      this.env.availableManagers,
      version,
    );
    if (methods.length > 0) {
      const chain = methods.map(([m]) => m).join(" → ");
      if (version) {
        console.log(
          `${bold("Fallback chain")} ${dim(`(for version ${version})`)}${
            bold(":")
          } ${green(chain)}`,
        );
      } else {
        console.log(`${bold("Fallback chain:")} ${green(chain)}`);
      }
    } else {
      console.log(
        `${bold("Fallback chain:")} ${red("none (no method available)")}`,
      );
    }
  }

  /**
   * Installs a single package using available backends with fallback.
   * Tries each installation method in priority order until one succeeds.
   * Collects errors from all failed attempts for reporting.
   */
  private async installOne(
    pkgSpec: string,
    dryRun: boolean,
    requiredVersion?: string,
  ): Promise<void> {
    const { name: pkgName, version } = parsePackageSpec(pkgSpec);
    const effectiveVersion = requiredVersion || version;
    const recipe = await this.getRecipe(pkgName);

    const methods = getInstallMethods(
      recipe,
      this.env.availableManagers,
      effectiveVersion,
    );
    if (methods.length === 0) {
      throw new Error(
        `No installation method available for ${pkgName}`,
      );
    }

    const versionDisplay = effectiveVersion ? `@${effectiveVersion}` : "";

    // Try each method in order (native → homebrew → script)
    const errors: Array<{ manager: string; error: string }> = [];

    for (let i = 0; i < methods.length; i++) {
      const [manager, method] = methods[i];
      const isLastMethod = i === methods.length - 1;

      if (dryRun) {
        // In dry-run mode, just show what would happen with the first method
        console.log(
          `${cyan("Would install:")} ${cyan(pkgName)}${versionDisplay} via ${
            yellow(manager)
          }`,
        );
        if (methods.length > 1) {
          const fallbacks = methods.slice(1).map(([m]) => m).join(", ");
          console.log(dim(`  Fallback methods available: ${fallbacks}`));
        }
        return;
      }

      try {
        console.log(
          `${green("Installing:")} ${cyan(pkgName)}${versionDisplay} via ${
            yellow(manager)
          }...`,
        );

        const backend = getBackend(manager);
        await backend.install(pkgName, method, dryRun, effectiveVersion);

        console.log(
          `${bold(green("Installed:"))} ${cyan(pkgName)}${versionDisplay}`,
        );
        return; // Success, no need to try other methods
      } catch (e) {
        const errorMsg = (e as Error).message;
        errors.push({ manager, error: errorMsg });

        if (!isLastMethod) {
          console.log(
            `${
              yellow("Failed:")
            } ${manager} installation failed, trying next method...`,
          );
          console.log(dim(`  Error: ${errorMsg}`));
        }
      }
    }

    // All methods failed
    console.log(
      red(`Failed to install ${pkgName} with all available methods:`),
    );
    for (const { manager, error } of errors) {
      console.log(`  ${yellow(manager)}: ${error}`);
    }
    throw new Error(`All installation methods failed for ${pkgName}`);
  }

  /**
   * Synchronizes installed packages with requirements.toml.
   * Validates all packages have available install methods before starting,
   * then installs each package while collecting successes and failures.
   * Throws if any package fails to install.
   */
  async sync(dryRun: boolean): Promise<void> {
    if (this.requirements.packages.length === 0) {
      console.log(yellow("No packages in requirements.toml"));
      console.log(
        dim("Add packages to requirements.toml and run 'e5 sync' again"),
      );
      return;
    }

    const toInstall: Array<{ spec: string; name: string; version?: string }> =
      [];
    const errors: string[] = [];

    for (const pkgSpec of this.requirements.packages) {
      const { name, version } = parsePackageSpec(pkgSpec);
      try {
        const recipe = await this.getRecipe(name);
        if (getInstallMethod(recipe, this.env.availableManagers)) {
          toInstall.push({ spec: pkgSpec, name, version });
        } else {
          errors.push(`${name}: no installation method available`);
        }
      } catch (e) {
        errors.push(`${name}: ${(e as Error).message}`);
      }
    }

    if (errors.length > 0) {
      console.log(yellow("Warnings:"));
      for (const err of errors) {
        console.log(`  ${yellow("!")} ${err}`);
      }
      console.log();
    }

    if (toInstall.length === 0) {
      return;
    }

    toInstall.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`${bold("Sync:")} ${toInstall.length} package(s) to install:`);
    for (const { spec } of toInstall) {
      console.log(`  - ${cyan(spec)}`);
    }
    console.log();

    const succeeded: string[] = [];
    const failed: Array<{ spec: string; error: string }> = [];

    for (const { spec, name, version } of toInstall) {
      try {
        await this.installOne(name, dryRun, version);
        succeeded.push(spec);
      } catch (e) {
        failed.push({ spec, error: (e as Error).message });
      }
    }

    // Print summary
    console.log();
    console.log(bold("Sync complete:"));
    if (succeeded.length > 0) {
      console.log(
        `  ${
          green(String(succeeded.length))
        } package(s) installed successfully`,
      );
    }
    if (failed.length > 0) {
      console.log(`  ${red(String(failed.length))} package(s) failed:`);
      for (const { spec, error } of failed) {
        console.log(`    ${red("✗")} ${cyan(spec)}: ${error}`);
      }
    }

    if (failed.length > 0) {
      throw new Error(`Failed to install ${failed.length} package(s)`);
    }
  }
}
