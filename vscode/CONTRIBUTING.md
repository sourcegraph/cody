# Contributing to Cody for VS Code

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Open this repository in VS Code and run the `Launch VS Code Extension` build/debug task (or run `cd vscode && pnpm run dev`).

Tip: Enable `cody.debug.enable` and `cody.debug.verbose` in VS Code settings during extension development.

## File structure

- `src`: source code of the components for the extension host
- `webviews`: source code of the extension UI (webviews), build with Vite and rollup.js using the `vite.config.ts` file at directory root
- `test/integration`: code for integration tests
- `test/e2e`: code for playwright UI tests
- `dist`: build outputs from both webpack and vite
- `resources`: everything in this directory will be move to the ./dist directory automatically during build time for easy packaging
- `index.html`: the entry file that Vite looks for to build the webviews. The extension host reads this file at run time and replace the variables inside the file with webview specific uri and info

## Testing

- Unit tests: `pnpm run test:unit`
- Integration tests: `pnpm run test:integration`
- End-to-end tests: `pnpm run test:e2e`

## Release

To publish a new release to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [Open VSX Registry](https://open-vsx.org/extension/sourcegraph/cody-ai):

1. Increment the `version` in [`package.json`](package.json).
1. Commit the version increment.
1. `git tag vscode-v$(jq -r .version package.json)`
1. `git push --tags`
1. Wait for the [vscode-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-release.yml) to finish.

Nightly builds are published automatically daily at 1500 UTC (see [vscode-nightly workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-nightly.yml)).
