# Contributing to Cody for VS Code

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Open this repository in VS Code and run the `Launch VS Code Extension (Desktop)` build/debug task (or run `cd vscode && pnpm run dev`).

Tip: Enable `cody.debug.enable` and `cody.debug.verbose` in VS Code settings during extension development.

## File structure

- `src`: source code of the components for the extension host
- `webviews`: source code of the extension sidebar webviews, built with Vite
- `test/integration`: code for integration tests
- `test/e2e`: code for playwright UI tests
- `dist`: build outputs from both webpack and vite
- `resources`: everything in this directory will be move to the ./dist directory automatically during build time for easy packaging
- `index.html`: the entry file that Vite looks for to build the webviews. The extension host reads this file at run time and replace the variables inside the file with webview specific uri and info

## Reporting autocomplete issues

The best way to help us improve code completions is by contributing your examples in the [Unhelpful Completions](https://github.com/sourcegraph/cody/discussions/358) discussion together with some context of how the autocomplete request was build.

### Accessing autocomplete logs

1. Enable `cody.debug.enable` and `cody.debug.verbose` in VS Code settings
   - Make sure to restart or reload VS Code after changing these settings
1. Open the Cody debug panel via "View > Output" and selecting the "Cody by Sourcegraph" option in the dropdown.

### Realtime autocomplete tracing

We also have some build-in UI to help during the development of autocomplete requests. To access this, run the `Cody > Open Autocomplete Trace View` action. This will open a new panel that will show all requests in real time.

## Testing

- Unit tests: `pnpm run test:unit`
- Integration tests: `pnpm run test:integration`
- End-to-end tests: `pnpm run test:e2e`

## Releases

### Stable builds

To publish a new release to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [Open VSX Registry](https://open-vsx.org/extension/sourcegraph/cody-ai):

1. Increment the `version` in [`package.json`](package.json).
1. Commit the version increment.
1. `git tag vscode-v$(jq -r .version package.json)`
1. `git push --tags`
1. Wait for the [vscode-stable-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-stable-release.yml) run to finish.

### Insiders builds

Insiders builds are nightly (or more frequent) builds with the latest from `main`. They're less stable but have the latest changes. Only use the insiders build if you want to test the latest changes.

#### Using the insiders build

To use the Cody insiders build in VS Code:

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai).
1. Select **Switch to Pre-release Version** in the extension's page in VS Code.
1. Wait for it to download and install, and then reload (by pressing **Reload Required**).

#### Publishing a new insiders build

Insiders builds are published automatically daily at 1500 UTC using the [vscode-insiders-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-insiders-release.yml).

To manually trigger an insiders build:

1. Open the [vscode-insiders-release workflow](https://github.com/sourcegraph/cody/actions/workflows/vscode-insiders-release.yml).
1. Press the **Run workflow ▾** button.
1. Select the branch you want to build from (usually `main`).
1. Press the **Run workflow** button.
1. Wait for the workflow run to finish.

### Running a release build locally

It can be helpful to build and run the packaged extension locally to replicate a typical user flow.

To do this:

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Run `pnpm vscode:prepublish`
1. Uninstall any existing Cody extension from VS Code.
1. Run `code --install-extension dist/cody.vsix`

#### Simulating a fresh user install

VS Code will preserve some extension state (e.g., configuration settings) even when an extension is uninstalled. To replicate the flow of a completely new user, run a separate instance of VS Code:

```shell
code --user-data-dir=/tmp/separate-vscode-instance --profile-temp
```

## Development tips

To open the Cody sidebar, autocomplete trace view, etc., when debugging starts, you can set hidden
VS Code user settings. See [`src/dev/helpers.ts`](src/dev/helpers.ts) for a list of available
options.
