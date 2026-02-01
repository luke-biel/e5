import { bold, cyan, green, red, yellow, underline, dim } from "@std/fmt/colors";
import {
  Environment,
  detectEnvironment,
} from "./detector.ts";
import {
  Recipe,
  getInstallMethod,
  isInstalled,
} from "./recipe.ts";
import { getBackend } from "./backends/mod.ts";
import { Repository, RepositoryConfig } from "./repository.ts";
import { Requirements, loadRequirements, saveRequirements, addPackage, removePackage } from "./requirements.ts";

export class Manager {
  private recipes: Map<string, Recipe> = new Map();

  private constructor(
    private requirementsPath: string,
    private requirements: Requirements,
    private repository: Repository,
    private env: Environment
  ) {}

  static async create(
    requirementsPath: string,
    repoConfig?: Partial<RepositoryConfig>
  ): Promise<Manager> {
    const requirements = loadRequirements(requirementsPath);
    const defaultConfig = Repository.getDefaultConfig();
    const config = { ...defaultConfig, ...repoConfig };
    const repository = new Repository(config);
    const env = await detectEnvironment();

    return new Manager(requirementsPath, requirements, repository, env);
  }

  async refreshIndex(): Promise<void> {
    await this.repository.fetchIndex(true);
  }

  async listRequired(): Promise<void> {
    console.log(bold("Required packages:"));
    console.log();

    if (this.requirements.packages.length === 0) {
      console.log(dim("  No packages in requirements.toml"));
      console.log(dim("  Use 'e5 add <package>' to add packages"));
      return;
    }

    for (const name of this.requirements.packages.sort()) {
      await this.printPackageStatus(name);
    }
  }

  async listInstalled(): Promise<void> {
    console.log(bold("Installed packages (from requirements):"));
    console.log();

    let count = 0;
    for (const name of this.requirements.packages.sort()) {
      try {
        const recipe = await this.getRecipe(name);
        if (this.isInstalledSync(recipe)) {
          const desc = recipe.package.description
            ? ` - ${recipe.package.description}`
            : "";
          console.log(`  ${cyan(name)}${desc}`);
          count++;
        }
      } catch {
        // Skip packages we can't fetch
      }
    }

    if (count === 0) {
      console.log("  No required packages installed");
    }
  }

  private async printPackageStatus(name: string): Promise<void> {
    try {
      const recipe = await this.getRecipe(name);
      const installed = this.isInstalledSync(recipe);
      const status = installed
        ? green("[installed]")
        : red("[not installed]");
      const desc = recipe.package.description
        ? ` - ${recipe.package.description}`
        : "";
      console.log(`  ${cyan(name)} ${status}${desc}`);
    } catch (e) {
      console.log(`  ${cyan(name)} ${red("[error]")} - ${(e as Error).message}`);
    }
  }

  private async getRecipe(name: string): Promise<Recipe> {
    if (!this.recipes.has(name)) {
      const recipe = await this.repository.fetchRecipe(name);
      this.recipes.set(name, recipe);
    }
    return this.recipes.get(name)!;
  }

  private isInstalledSync(recipe: Recipe): boolean {
    if (recipe.package.verifyCommand) {
      try {
        const command = new Deno.Command("sh", {
          args: ["-c", recipe.package.verifyCommand],
          stdout: "null",
          stderr: "null",
        });
        const { code } = command.outputSync();
        return code === 0;
      } catch {
        return false;
      }
    }

    const binary = recipe.package.verifyBinary || recipe.package.name;
    try {
      const command = new Deno.Command("which", {
        args: [binary],
        stdout: "null",
        stderr: "null",
      });
      const { code } = command.outputSync();
      return code === 0;
    } catch {
      return false;
    }
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
      const inReqs = this.requirements.packages.includes(entry.name);
      const marker = inReqs ? green(" [required]") : "";
      const desc = entry.description ? ` - ${entry.description}` : "";
      console.log(`  ${cyan(entry.name)}${marker}${desc}`);
    }
  }

  async listAvailable(): Promise<void> {
    console.log(bold("Available packages in repository:"));
    console.log();

    const index = await this.repository.fetchIndex();

    for (const entry of index.recipes.sort((a, b) => a.name.localeCompare(b.name))) {
      const inReqs = this.requirements.packages.includes(entry.name);
      const marker = inReqs ? green(" [required]") : "";
      const desc = entry.description ? ` - ${entry.description}` : "";
      console.log(`  ${cyan(entry.name)}${marker}${desc}`);
    }
  }

  async show(packageName: string): Promise<void> {
    const recipe = await this.getRecipe(packageName);

    console.log(`${bold("Package:")} ${cyan(recipe.package.name)}`);

    if (recipe.package.description) {
      console.log(`${bold("Description:")} ${recipe.package.description}`);
    }

    if (recipe.package.homepage) {
      console.log(`${bold("Homepage:")} ${recipe.package.homepage}`);
    }

    const inReqs = this.requirements.packages.includes(packageName);
    console.log(`${bold("In requirements:")} ${inReqs ? green("yes") : yellow("no")}`);

    const installed = this.isInstalledSync(recipe);
    const status = installed ? green("installed") : red("not installed");
    console.log(`${bold("Status:")} ${status}`);

    console.log();
    console.log(bold("Installation methods:"));
    for (const [key, method] of recipe.installMethods) {
      const pkgName = method.packageName || recipe.package.name;
      if (method.script) {
        console.log(`  ${yellow(key)}: <script>`);
      } else {
        console.log(`  ${yellow(key)}: ${pkgName}`);
      }
    }

    console.log();
    console.log(bold("Available tools:"));
    console.log(`  ${cyan(this.env.availableManagers.join(", "))}`);

    const result = getInstallMethod(recipe, this.env.availableManagers);
    if (result) {
      const [manager] = result;
      console.log(`${bold("Would use:")} ${green(manager)}`);
    } else {
      console.log(`${bold("Would use:")} ${red("none (no method available)")}`);
    }
  }

  async add(packageNames: string[]): Promise<void> {
    await this.repository.fetchIndex();

    for (const name of packageNames) {
      const index = this.repository.getIndex();
      const exists = index?.recipes.some(r => r.name === name);

      if (!exists) {
        console.log(`${red("Error:")} Package '${name}' not found in repository`);
        continue;
      }

      if (addPackage(this.requirements, name)) {
        console.log(`${green("Added:")} ${cyan(name)} to requirements`);
      } else {
        console.log(`${yellow("Skipped:")} ${cyan(name)} already in requirements`);
      }
    }

    saveRequirements(this.requirementsPath, this.requirements);
  }

  async remove(packageNames: string[]): Promise<void> {
    for (const name of packageNames) {
      if (removePackage(this.requirements, name)) {
        console.log(`${green("Removed:")} ${cyan(name)} from requirements`);
      } else {
        console.log(`${yellow("Skipped:")} ${cyan(name)} not in requirements`);
      }
    }

    saveRequirements(this.requirementsPath, this.requirements);
  }

  async install(packages: string[], dryRun: boolean): Promise<void> {
    for (const pkg of packages) {
      await this.installOne(pkg, dryRun);
    }
  }

  private async installOne(packageName: string, dryRun: boolean): Promise<void> {
    const recipe = await this.getRecipe(packageName);

    if (await isInstalled(recipe)) {
      console.log(
        `${yellow("Skipping:")} ${cyan(packageName)} is already installed`
      );
      return;
    }

    const result = getInstallMethod(recipe, this.env.availableManagers);
    if (!result) {
      throw new Error(
        `No installation method available for ${packageName}`
      );
    }

    const [manager, method] = result;

    if (dryRun) {
      console.log(
        `${cyan("Would install:")} ${cyan(packageName)} via ${yellow(manager)}`
      );
    } else {
      console.log(
        `${green("Installing:")} ${cyan(packageName)} via ${yellow(manager)}...`
      );
    }

    const backend = getBackend(manager);
    await backend.install(packageName, method, dryRun);

    if (!dryRun) {
      console.log(`${bold(green("Installed:"))} ${cyan(packageName)}`);
    }
  }

  async sync(dryRun: boolean): Promise<void> {
    if (this.requirements.packages.length === 0) {
      console.log(yellow("No packages in requirements.toml"));
      console.log(dim("Use 'e5 add <package>' to add packages"));
      return;
    }

    const toInstall: string[] = [];
    const errors: string[] = [];

    for (const name of this.requirements.packages) {
      try {
        const recipe = await this.getRecipe(name);
        if (!(await isInstalled(recipe))) {
          if (getInstallMethod(recipe, this.env.availableManagers)) {
            toInstall.push(name);
          } else {
            errors.push(`${name}: no installation method available`);
          }
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
      console.log(green("All required packages are already installed!"));
      return;
    }

    toInstall.sort();

    console.log(`${bold("Sync:")} ${toInstall.length} package(s) to install:`);
    for (const name of toInstall) {
      console.log(`  - ${cyan(name)}`);
    }
    console.log();

    await this.install(toInstall, dryRun);
  }

  async status(): Promise<void> {
    console.log(underline(bold("Environment")));
    console.log();
    console.log(
      `  ${bold("Available tools:")} ${cyan(this.env.availableManagers.join(", "))}`
    );
    console.log(`  ${bold("Requirements file:")} ${cyan(this.requirementsPath)}`);

    try {
      const index = await this.repository.fetchIndex();
      console.log(`  ${bold("Repository packages:")} ${cyan(String(index.recipes.length))}`);
    } catch {
      console.log(`  ${bold("Repository:")} ${red("unavailable")}`);
    }

    console.log();

    const total = this.requirements.packages.length;
    let installed = 0;
    let available = 0;

    for (const name of this.requirements.packages) {
      try {
        const recipe = await this.getRecipe(name);
        if (this.isInstalledSync(recipe)) {
          installed++;
        }
        if (getInstallMethod(recipe, this.env.availableManagers)) {
          available++;
        }
      } catch {
        // Skip errors
      }
    }

    console.log(underline(bold("Requirements")));
    console.log();
    console.log(`  ${bold("Total:")} ${total}`);
    console.log(`  ${bold("Installed:")} ${green(String(installed))} / ${total}`);
    console.log(`  ${bold("Available:")} ${cyan(String(available))}`);
    console.log(`  ${bold("Unavailable:")} ${yellow(String(total - available))}`);
  }
}
