# e5

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
