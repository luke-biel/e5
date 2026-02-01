import { bold, cyan, green, red, yellow, dim } from "@std/fmt/colors";
import {
  Environment,
  detectEnvironment,
} from "./detector.ts";
import {
  Recipe,
  getInstallMethod,
  isInstalled,
  checkVersion,
  getInstalledVersion,
} from "./recipe.ts";
import { getBackend } from "./backends/mod.ts";
import { Repository, RepositoryConfig } from "./repository.ts";
import {
  Requirements,
  loadRequirements,
  parsePackageSpec,
} from "./requirements.ts";

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

  async listRequired(): Promise<void> {
    console.log(bold("Required packages:"));
    console.log();

    if (this.requirements.packages.length === 0) {
      console.log(dim("  No packages in requirements.toml"));
      console.log(dim("  Add packages to requirements.toml and run 'e5 sync'"));
      return;
    }

    let installed = 0;
    let versionMismatches = 0;
    const total = this.requirements.packages.length;

    for (const spec of this.requirements.packages.sort()) {
      const result = await this.printPackageStatus(spec);
      if (result === "installed") installed++;
      else if (result === "mismatch") versionMismatches++;
    }

    console.log();
    const notInstalled = total - installed - versionMismatches;
    const parts: string[] = [];
    parts.push(`${green(String(installed))} installed`);
    if (versionMismatches > 0) parts.push(`${yellow(String(versionMismatches))} version mismatch`);
    if (notInstalled > 0) parts.push(`${red(String(notInstalled))} not installed`);
    console.log(`${bold("Summary:")} ${parts.join(", ")} (${total} total)`);
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

  private async printPackageStatus(packageSpec: string): Promise<"installed" | "mismatch" | "not_installed" | "error"> {
    const { name, version: requiredVersion } = parsePackageSpec(packageSpec);
    try {
      const recipe = await this.getRecipe(name);
      const versionCheck = await checkVersion(recipe, requiredVersion);

      let status: string;
      let versionInfo = "";
      let result: "installed" | "mismatch" | "not_installed";

      if (!versionCheck.installed) {
        status = red("[not installed]");
        result = "not_installed";
      } else if (requiredVersion && !versionCheck.versionMatch) {
        status = yellow("[version mismatch]");
        versionInfo = ` (installed: ${versionCheck.installedVersion || "unknown"}, required: ${requiredVersion})`;
        result = "mismatch";
      } else {
        status = green("[installed]");
        if (versionCheck.installedVersion) {
          versionInfo = ` (${versionCheck.installedVersion})`;
        }
        result = "installed";
      }

      const desc = recipe.package.description
        ? ` - ${recipe.package.description}`
        : "";
      console.log(`  ${cyan(packageSpec)} ${status}${versionInfo}${desc}`);
      return result;
    } catch (e) {
      console.log(`  ${cyan(packageSpec)} ${red("[error]")} - ${(e as Error).message}`);
      return "error";
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


  private async installOne(
    packageSpec: string,
    dryRun: boolean,
    ignoreLocal = false,
    requiredVersion?: string
  ): Promise<void> {
    const { name: packageName, version } = parsePackageSpec(packageSpec);
    const effectiveVersion = requiredVersion || version;
    const recipe = await this.getRecipe(packageName);

    if (!ignoreLocal) {
      const versionCheck = await checkVersion(recipe, effectiveVersion);

      if (versionCheck.installed) {
        if (effectiveVersion && !versionCheck.versionMatch) {
          console.log(
            `${yellow("Version mismatch:")} ${cyan(packageName)} has version ${versionCheck.installedVersion || "unknown"}, but ${effectiveVersion} is required`
          );
          console.log(
            `${dim("  Use --ignore-local to install the required version anyway")}`
          );
          return;
        }
        console.log(
          `${yellow("Skipping:")} ${cyan(packageName)} is already installed${versionCheck.installedVersion ? ` (${versionCheck.installedVersion})` : ""}`
        );
        return;
      }
    }

    const result = getInstallMethod(recipe, this.env.availableManagers);
    if (!result) {
      throw new Error(
        `No installation method available for ${packageName}`
      );
    }

    const [manager, method] = result;

    const versionDisplay = effectiveVersion ? `@${effectiveVersion}` : "";
    if (dryRun) {
      console.log(
        `${cyan("Would install:")} ${cyan(packageName)}${versionDisplay} via ${yellow(manager)}`
      );
    } else {
      console.log(
        `${green("Installing:")} ${cyan(packageName)}${versionDisplay} via ${yellow(manager)}...`
      );
    }

    const backend = getBackend(manager);
    await backend.install(packageName, method, dryRun, effectiveVersion);

    if (!dryRun) {
      console.log(`${bold(green("Installed:"))} ${cyan(packageName)}${versionDisplay}`);
    }
  }

  async sync(dryRun: boolean, ignoreLocal = false): Promise<void> {
    if (this.requirements.packages.length === 0) {
      console.log(yellow("No packages in requirements.toml"));
      console.log(dim("Add packages to requirements.toml and run 'e5 sync' again"));
      return;
    }

    const toInstall: Array<{ spec: string; name: string; version?: string; reason: string }> = [];
    const errors: string[] = [];
    const versionMismatches: string[] = [];

    for (const packageSpec of this.requirements.packages) {
      const { name, version: requiredVersion } = parsePackageSpec(packageSpec);
      try {
        const recipe = await this.getRecipe(name);
        const versionCheck = await checkVersion(recipe, requiredVersion);

        if (!versionCheck.installed) {
          if (getInstallMethod(recipe, this.env.availableManagers)) {
            toInstall.push({
              spec: packageSpec,
              name,
              version: requiredVersion,
              reason: "not installed",
            });
          } else {
            errors.push(`${name}: no installation method available`);
          }
        } else if (requiredVersion && !versionCheck.versionMatch) {
          if (ignoreLocal) {
            if (getInstallMethod(recipe, this.env.availableManagers)) {
              toInstall.push({
                spec: packageSpec,
                name,
                version: requiredVersion,
                reason: `version mismatch (${versionCheck.installedVersion || "unknown"} -> ${requiredVersion})`,
              });
            } else {
              errors.push(`${name}: no installation method available`);
            }
          } else {
            versionMismatches.push(
              `${name}: installed ${versionCheck.installedVersion || "unknown"}, required ${requiredVersion}`
            );
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

    if (versionMismatches.length > 0) {
      console.log(yellow("Version mismatches (use --ignore-local to reinstall):"));
      for (const mismatch of versionMismatches) {
        console.log(`  ${yellow("!")} ${mismatch}`);
      }
      console.log();
    }

    if (toInstall.length === 0) {
      if (versionMismatches.length > 0) {
        console.log(yellow("Some packages have version mismatches. Use --ignore-local to reinstall them."));
      } else {
        console.log(green("All required packages are already installed!"));
      }
      return;
    }

    toInstall.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`${bold("Sync:")} ${toInstall.length} package(s) to install:`);
    for (const { spec, reason } of toInstall) {
      console.log(`  - ${cyan(spec)} (${reason})`);
    }
    console.log();

    for (const { name, version } of toInstall) {
      await this.installOne(name, dryRun, ignoreLocal, version);
    }
  }

}
