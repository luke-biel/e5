import { parseArgs } from "@std/cli/parse-args";
import { red, bold } from "@std/fmt/colors";
import { Manager } from "./manager.ts";

function getDefaultRequirementsPath(): string {
  const envPath = Deno.env.get("E5_REQUIREMENTS");
  if (envPath) return envPath;
  return "./requirements.toml";
}

function printHelp(): void {
  console.log(`e5 - Cross-platform tool installation manager

USAGE:
  e5 [OPTIONS] <COMMAND>

COMMANDS:
  list                List required packages and their status
  list --available    List all packages available in repository
  search <query>      Search for packages in repository
  show <package>      Show details about a specific package
  add <pkg...>        Add packages to requirements.toml
  remove <pkg...>     Remove packages from requirements.toml
  install <pkg...>    Install specific packages
  sync                Install all required packages that aren't installed
  status              Show environment and requirements status
  refresh             Refresh the repository index cache

OPTIONS:
  -f, --file <PATH>      Path to requirements.toml (default: ./requirements.toml)
  -u, --repo-url <URL>   Repository URL (or set E5_REPO_URL)
  -n, --dry-run          Show what would be done without executing
  -i, --installed        Only show installed packages (for list command)
  -a, --available        Show all available packages (for list command)
  -h, --help             Show this help message
  -V, --version          Show version

ENVIRONMENT VARIABLES:
  E5_REQUIREMENTS  Path to requirements.toml
  E5_REPO_URL      Repository URL for package index

EXAMPLES:
  e5 add protobuf-compiler hurl
  e5 sync
  e5 list
  e5 search toml
`);
}

async function main(): Promise<number> {
  const args = parseArgs(Deno.args, {
    string: ["file", "f", "repo-url", "u"],
    boolean: ["help", "h", "version", "V", "dry-run", "n", "installed", "i", "available", "a"],
    alias: {
      f: "file",
      u: "repo-url",
      h: "help",
      V: "version",
      n: "dry-run",
      i: "installed",
      a: "available",
    },
  });

  if (args.help || args.h) {
    printHelp();
    return 0;
  }

  if (args.version || args.V) {
    console.log("e5 0.1.0");
    return 0;
  }

  const command = args._[0] as string | undefined;
  if (!command) {
    printHelp();
    return 1;
  }

  const requirementsPath = args.file || getDefaultRequirementsPath();
  const repoUrl = args["repo-url"];
  const dryRun = args["dry-run"] || false;
  const installedOnly = args.installed || false;
  const showAvailable = args.available || false;

  try {
    const repoConfig = repoUrl ? { url: repoUrl } : undefined;
    const manager = await Manager.create(requirementsPath, repoConfig);

    switch (command) {
      case "list":
        if (showAvailable) {
          await manager.listAvailable();
        } else if (installedOnly) {
          await manager.listInstalled();
        } else {
          await manager.listRequired();
        }
        break;

      case "search": {
        const query = args._[1] as string | undefined;
        if (!query) {
          console.error(red("Error: search query required"));
          return 1;
        }
        await manager.search(query);
        break;
      }

      case "show": {
        const pkg = args._[1] as string | undefined;
        if (!pkg) {
          console.error(red("Error: package name required"));
          return 1;
        }
        await manager.show(pkg);
        break;
      }

      case "add": {
        const packages = args._.slice(1) as string[];
        if (packages.length === 0) {
          console.error(red("Error: at least one package name required"));
          return 1;
        }
        await manager.add(packages);
        break;
      }

      case "remove": {
        const packages = args._.slice(1) as string[];
        if (packages.length === 0) {
          console.error(red("Error: at least one package name required"));
          return 1;
        }
        await manager.remove(packages);
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
        await manager.status();
        break;

      case "refresh":
        await manager.refreshIndex();
        console.log("Repository index refreshed");
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
