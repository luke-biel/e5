import { bold, cyan, green, red, yellow, underline } from "@std/fmt/colors";
import {
  Environment,
  detectEnvironment,
  PackageManager,
} from "./detector.ts";
import {
  Recipe,
  loadRecipe,
  getInstallMethod,
  isInstalled,
} from "./recipe.ts";
import { getBackend } from "./backends/mod.ts";

export class Manager {
  private constructor(
    private recipesDir: string,
    private env: Environment,
    private recipes: Map<string, Recipe>
  ) {}

  static async create(recipesDir: string): Promise<Manager> {
    try {
      Deno.statSync(recipesDir);
    } catch {
      throw new Error(`Recipes directory not found: ${recipesDir}`);
    }

    const env = await detectEnvironment();
    const recipes = new Map<string, Recipe>();

    for (const entry of Deno.readDirSync(recipesDir)) {
      if (entry.isFile && entry.name.endsWith(".toml")) {
        try {
          const recipe = loadRecipe(`${recipesDir}/${entry.name}`);
          recipes.set(recipe.package.name, recipe);
        } catch (e) {
          console.log(
            yellow(`Warning: Failed to load ${entry.name}: ${(e as Error).message}`)
          );
        }
      }
    }

    return new Manager(recipesDir, env, recipes);
  }

  listAll(): void {
    console.log(bold("Available packages:"));
    console.log();

    const names = [...this.recipes.keys()].sort();

    for (const name of names) {
      const recipe = this.recipes.get(name)!;
      this.printPackageLine(recipe);
    }
  }

  listInstalled(): void {
    console.log(bold("Installed packages:"));
    console.log();

    const names = [...this.recipes.keys()].sort();
    let count = 0;

    for (const name of names) {
      const recipe = this.recipes.get(name)!;
      // Note: This is sync check for display purposes
      const installed = this.isInstalledSync(recipe);
      if (installed) {
        const desc = recipe.package.description
          ? ` - ${recipe.package.description}`
          : "";
        console.log(`  ${cyan(name)}${desc}`);
        count++;
      }
    }

    if (count === 0) {
      console.log("  No packages installed");
    }
  }

  private printPackageLine(recipe: Recipe): void {
    const installed = this.isInstalledSync(recipe);
    const status = installed
      ? green("[installed]")
      : red("[not installed]");
    const desc = recipe.package.description
      ? ` - ${recipe.package.description}`
      : "";
    console.log(`  ${cyan(recipe.package.name)} ${status}${desc}`);
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

  show(packageName: string): void {
    const recipe = this.recipes.get(packageName);
    if (!recipe) {
      throw new Error(`Recipe not found: ${packageName}`);
    }

    console.log(`${bold("Package:")} ${cyan(recipe.package.name)}`);

    if (recipe.package.description) {
      console.log(`${bold("Description:")} ${recipe.package.description}`);
    }

    if (recipe.package.homepage) {
      console.log(`${bold("Homepage:")} ${recipe.package.homepage}`);
    }

    const installed = this.isInstalledSync(recipe);
    const status = installed ? green("installed") : red("not installed");
    console.log(`${bold("Status:")} ${status}`);

    console.log();
    console.log(bold("Installation methods:"));
    for (const [key, method] of recipe.installMethods) {
      const pkgName = method.packageName || recipe.package.name;
      if (method.script) {
        console.log(`  ${yellow(key)} (script): custom script`);
      } else {
        console.log(`  ${yellow(key)}: ${pkgName}`);
      }
    }

    console.log();
    console.log(bold("Current environment:"));
    console.log(`  OS: ${cyan(this.env.os)}`);
    console.log(
      `  Available managers: ${cyan(this.env.availableManagers.join(", "))}`
    );

    const result = getInstallMethod(
      recipe,
      this.env.os,
      this.env.availableManagers
    );
    if (result) {
      const [manager] = result;
      console.log(`  Would use: ${green(manager)} (${green("available")})`);
    } else {
      console.log(`  Would use: ${red("none")} (${red("no method available")})`);
    }
  }

  async install(packages: string[], dryRun: boolean): Promise<void> {
    for (const pkg of packages) {
      await this.installOne(pkg, dryRun);
    }
  }

  private async installOne(packageName: string, dryRun: boolean): Promise<void> {
    const recipe = this.recipes.get(packageName);
    if (!recipe) {
      throw new Error(`Recipe not found: ${packageName}`);
    }

    if (await isInstalled(recipe)) {
      console.log(
        `${yellow("Skipping:")} ${cyan(packageName)} is already installed`
      );
      return;
    }

    const result = getInstallMethod(
      recipe,
      this.env.os,
      this.env.availableManagers
    );
    if (!result) {
      throw new Error(
        `No installation method available for ${packageName} on this system`
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
    const toInstall: string[] = [];

    for (const [name, recipe] of this.recipes) {
      if (!(await isInstalled(recipe))) {
        if (getInstallMethod(recipe, this.env.os, this.env.availableManagers)) {
          toInstall.push(name);
        }
      }
    }

    if (toInstall.length === 0) {
      console.log(green("All packages are already installed!"));
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

  status(): void {
    console.log(underline(bold("Environment Status")));
    console.log();
    console.log(`  ${bold("OS:")} ${cyan(this.env.os)}`);
    console.log(
      `  ${bold("Default manager:")} ${cyan(this.env.defaultManager || "none")}`
    );
    console.log(
      `  ${bold("Available managers:")} ${cyan(
        this.env.availableManagers.join(", ")
      )}`
    );
    console.log(`  ${bold("Recipes directory:")} ${cyan(this.recipesDir)}`);
    console.log();

    const total = this.recipes.size;
    let installed = 0;
    let available = 0;

    for (const recipe of this.recipes.values()) {
      if (this.isInstalledSync(recipe)) {
        installed++;
      }
      if (getInstallMethod(recipe, this.env.os, this.env.availableManagers)) {
        available++;
      }
    }

    console.log(underline(bold("Package Summary")));
    console.log();
    console.log(`  ${bold("Total recipes:")} ${total}`);
    console.log(`  ${bold("Installed:")} ${green(String(installed))} / ${total}`);
    console.log(
      `  ${bold("Available for this system:")} ${cyan(String(available))}`
    );
    console.log(
      `  ${bold("Not installable here:")} ${yellow(String(total - available))}`
    );
  }
}
