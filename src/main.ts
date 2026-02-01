import { parseArgs } from "@std/cli/parse-args";
import { red, bold } from "@std/fmt/colors";
import { Manager } from "./manager.ts";

function getDefaultRecipesDir(): string {
  const envDir = Deno.env.get("ENVSETUP_RECIPES_DIR");
  if (envDir) return envDir;

  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
  const configDir = `${home}/.config/envsetup/recipes`;

  try {
    Deno.statSync(configDir);
    return configDir;
  } catch {
    return "./recipes";
  }
}

function printHelp(): void {
  console.log(`envsetup - Cross-platform tool installation manager

USAGE:
  envsetup [OPTIONS] <COMMAND>

COMMANDS:
  list              List available packages
  show <package>    Show details about a specific package
  install <pkg...>  Install one or more packages
  sync              Install all packages that aren't already installed
  status            Show installation status of all packages

OPTIONS:
  -r, --recipes-dir <DIR>  Path to recipes directory
  -n, --dry-run            Show what would be done without executing
  -i, --installed          Only show installed packages (for list command)
  -h, --help               Show this help message
  -V, --version            Show version
`);
}

async function main(): Promise<number> {
  const args = parseArgs(Deno.args, {
    string: ["recipes-dir", "r"],
    boolean: ["help", "h", "version", "V", "dry-run", "n", "installed", "i"],
    alias: {
      r: "recipes-dir",
      h: "help",
      V: "version",
      n: "dry-run",
      i: "installed",
    },
  });

  if (args.help || args.h) {
    printHelp();
    return 0;
  }

  if (args.version || args.V) {
    console.log("envsetup 0.1.0");
    return 0;
  }

  const command = args._[0] as string | undefined;
  if (!command) {
    printHelp();
    return 1;
  }

  const recipesDir = args["recipes-dir"] || getDefaultRecipesDir();
  const dryRun = args["dry-run"] || false;
  const installedOnly = args.installed || false;

  try {
    const manager = await Manager.create(recipesDir);

    switch (command) {
      case "list":
        if (installedOnly) {
          manager.listInstalled();
        } else {
          manager.listAll();
        }
        break;

      case "show": {
        const pkg = args._[1] as string | undefined;
        if (!pkg) {
          console.error(red("Error: package name required"));
          return 1;
        }
        manager.show(pkg);
        break;
      }

      case "install": {
        const packages = args._.slice(1) as string[];
        if (packages.length === 0) {
          console.error(red("Error: at least one package name required"));
          return 1;
        }
        await manager.install(packages, dryRun);
        break;
      }

      case "sync":
        await manager.sync(dryRun);
        break;

      case "status":
        manager.status();
        break;

      default:
        console.error(red(`Error: unknown command '${command}'`));
        printHelp();
        return 1;
    }
  } catch (e) {
    console.error(`${red(bold("Error:"))} ${(e as Error).message}`);
    return 1;
  }

  return 0;
}

Deno.exit(await main());
