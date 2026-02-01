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
  sync                Install all required packages that aren't installed

OPTIONS:
  -f, --file <PATH>      Path to requirements.toml (default: ./requirements.toml)
  -u, --repo-url <URL>   Repository URL (or set E5_REPO_URL)
  -n, --dry-run          Show what would be done without executing
  -i, --installed        Only show installed packages (for list command)
  -a, --available        Show all available packages (for list command)
  --ignore-local         Install packages even if a different version is present locally
  -h, --help             Show this help message
  -V, --version          Show version

ENVIRONMENT VARIABLES:
  E5_REQUIREMENTS  Path to requirements.toml
  E5_REPO_URL      Repository URL for package index
`);
}

async function main(): Promise<number> {
  const args = parseArgs(Deno.args, {
    string: ["file", "f", "repo-url", "u"],
    boolean: ["help", "h", "version", "V", "dry-run", "n", "installed", "i", "available", "a", "ignore-local"],
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
  const ignoreLocal = args["ignore-local"] || false;

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

      case "sync":
        await manager.sync(dryRun, ignoreLocal);
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
