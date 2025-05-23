# Release Captain CLI

An interactive CLI tool that guides Cody release captains through the release process.

For details about the release process, see the [Release Captain Playbook](https://www.notion.so/sourcegraph/Release-Captain-Playbook).

## Features

- Interactive guided workflows for each phase of the release process
- Automation of repetitive tasks
- Support for different release types (VSCode, JetBrains, agent CLI, Cody Web)
- Progress tracking across release stages
- Dry run mode for training and testing

## Installation

### Standard Build

```bash
cd scripts/release-captain
pnpm install
pnpm run build
```

### Recommended: Install as Global Command

To install the CLI as a global command `release-captain` (recommended for release captains):

```bash
cd scripts/release-captain
pnpm install
pnpm run build
pnpm link --global
```

## Usage

After installing globally, you can use the CLI directly:

```bash
# Start the interactive release process
release-captain start

# Go directly to a specific stage
release-captain create-branch
release-captain stabilize
release-captain ship
release-captain wrap-up

# Run in dry run mode (practice without triggering real actions)
release-captain start --dry-run
release-captain create-branch --dry-run

# Get information about the latest release
release-captain info
```

> **Note:** If you haven't installed the CLI globally, you can run the commands using `pnpm run dev` instead:
>
> ```bash
> cd scripts/release-captain
> pnpm run dev start
> ```

## Development

```bash
# Run in development mode
pnpm run dev
```

## Requirements

- Node.js 16+
- Git
- GitHub CLI (`gh`)
