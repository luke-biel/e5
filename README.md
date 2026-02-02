# e5 (ensure)

Cross-platform tool installation manager. Define your tools in `requirements.toml`, run `e5 sync`.

## Overview

*What e5 isn't:*

* A package/dependency manager
* A build tool

*What it is:*

A simple utility for installing necessary tools in development and CI environments. 
It's supposed to streamline bare GitHub actions provisioning, and make it easier for new developers to get started with building their projects.

## Usage

```bash
e5 sync                  # Install all packages from requirements.toml
e5 list                  # Show status of required packages
e5 list --available      # List all packages in repository
e5 search <query>        # Search for packages
e5 show <package>        # Show package details
```

## requirements.toml

```toml
packages = [
  "hurl",
  "taplo@0.9.3",      # pin specific version
  "protobuf-compiler",
]
```

## Version Pinning

You can pin packages to specific versions using the `package@version` syntax. However, version pinning support varies by backend:

| Backend  | Version Support | Notes |
|----------|-----------------|-------|
| apt      | Yes | Uses `apt-get install package=version` syntax |
| script   | Yes | Version passed as `VERSION` environment variable |
| homebrew | No | Use versioned formula names instead (e.g., `node@18`) |
| pacman   | No | Use script backend with Arch Linux Archive for specific versions |

When a version is specified but the backend doesn't support it, a warning is displayed and the latest version is installed.

## Installation Fallback

e5 automatically tries multiple installation methods if one fails. The fallback order is:

1. **Native package manager** (apt, pacman) - highest priority
2. **Homebrew** - cross-platform fallback
3. **Script** - universal fallback

For example, if a package has both `apt` and `script` installation methods defined and `apt` fails (e.g., version not available), e5 will automatically try the `script` method.

Use `e5 show <package>` to see the fallback chain for a specific package.

# Security

`e5` is designed to be as crude as possible. It will eval some commands on your system, which can lead to eg.: secret exfiltration.
It's also designed to be ran in a privileged environment. One may guess what kind of attacks this may lead to.

**If you are using it, create your own repository to ensure you control the scripts that are executed.**
