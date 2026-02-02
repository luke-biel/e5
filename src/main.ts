import { parseArgs } from "@std/cli/parse-args";
import { bold, red } from "@std/fmt/colors";
import { Manager } from "./manager.ts";
import config from "../deno.json" with { type: "json" };

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
  list                List required packages
  list --available    List all packages available in repository
  search <query>      Search for packages in repository
  show <package>      Show details about a specific package
  sync                Install all required packages

OPTIONS:
  -f, --file <PATH>      Path to requirements.toml (default: ./requirements.toml)
  -u, --repo-url <URL>   Repository URL (or set E5_REPO_URL)
  -n, --dry-run          Show what would be done without executing
  -a, --available        Show all available packages (for list command)
  -h, --help             Show this help message
  -V, --version          Show version

ENVIRONMENT VARIABLES:
  E5_REQUIREMENTS  Path to requirements.toml
  E5_REPO_URL      Repository URL for package index
`);
}

async function main(): Promise<number> {
  const args = parseArgs(Deno.args, {
    string: ["file", "repo-url"],
    boolean: ["help", "version", "dry-run", "available"],
    alias: {
      f: "file",
      u: "repo-url",
      h: "help",
      V: "version",
      n: "dry-run",
      a: "available",
    },
  });

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.version) {
    console.log(`${config.name} ${config.version}`);
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
  const availableOnly = args.available || false;

  try {
    const repoConfig = repoUrl ? { url: repoUrl } : undefined;
    const manager = await Manager.create(requirementsPath, repoConfig);

    switch (command) {
      case "list":
        if (availableOnly) {
          await manager.listAvailable();
        } else {
          manager.listRequired();
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
        await manager.sync(dryRun);
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
