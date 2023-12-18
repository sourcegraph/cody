## Development

### Setup

1. Install [asdf](https://asdf-vm.com/)
1. Run `asdf install` (if needed, run `asdf plugin add NAME` for any missing plugins)
1. Run `pnpm install && pnpm build`

### Build and run the VS Code extension

Open this repository in VS Code and run the `Launch VS Code Extension (Desktop)` build/debug task (or run `pnpm -C vscode run dev`).

See [vscode/CONTRIBUTING.md](../../vscode/CONTRIBUTING.md) for more information.

### Other topics

- [Developing the Cody library packages (`@sourcegraph/cody-{shared,ui}`)](library-development.md)
- [Quality tools](quality/index.md)
