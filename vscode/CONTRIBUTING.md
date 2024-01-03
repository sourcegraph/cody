# Contributing to Cody for VS Code

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Open this repository in VS Code and run the `Launch VS Code Extension (Desktop)` build/debug task (or run `cd vscode && pnpm run build && pnpm run dev`).

Tip: Enable `cody.debug.enable` and `cody.debug.verbose` in VS Code settings during extension development.

## File structure

- `src`: source code of the components for the extension host
- `webviews`: source code of the extension sidebar webviews, built with Vite
- `test`: [tests](test/README.md)
- `dist`: build outputs from both esbuild and vite
- `resources`: everything in this directory will be moved to the ./dist directory automatically during build time for easy packaging
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

1. Increment the `version` in [`package.json`](package.json) & [`CHANGELOG`](CHANGELOG.md).
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

### Wasm tree sitter modules

We use tree-sitter parser for a better code analysis in post completion process. In order to be able
to run these modules in VSCode runtime we have to use their wasm version. Wasm modules are not common
modules, you can't just inline them into the bundle by default, you have to load them separately and
connect them with special `load` wasm API.

We don't keep these modules in .git tree, but instead we load them manually from our google cloud bucket.
In order to do it you can run `./scripts/download-wasm-modules.ts` or just `pnpm download-wasm` before
running you vscode locally.

### Debugging with dedicated Node DevTools

1. **Initialize the Build Watcher**: Run the following command from the monorepo root to start the build watcher:

```sh
pnpm --filter cody-ai run watch:build:dev:desktop
```

2. **Launch the VSCode Extension Host**: Next, start the VSCode extension host by executing the command below from the monorepo root:

```sh
pnpm --filter cody-ai run start:dev:desktop
```

3. **Access the Chrome Inspector**: Open up your Google Chrome browser and navigate to `chrome://inspect/#devices`.
4. **Open Node DevTools**: Look for and click on the option that says "Open dedicated DevTools for Node".
5. **Specify the Debugging Endpoint**: At this point, DevTools aren't initialized yet. Therefore, you need to specify [the debugging endpoint](https://nodejs.org/en/docs/inspector/) `localhost:9333` (the port depends on the `--inspect-extensions` CLI flag used in the `start:debug` npm script)
6. **Start Debugging Like a PRO**: yay!

## Telemetry events

Events will eventually be migrated to [Sourcegraph's new telemetry events framework](https://sourcegraph.com/docs/dev/background-information/telemetry). Events primarily comprise of:

1. `feature`, a string denoting the feature that the event is associated with.
   1. **All events must use a `feature` that starts with `cody.`**, for example `cody.myFeature`
   2. The feature name should not include the name of the extension, as that is already included in the event metadata.
2. `action`, a string denoting the action on the feature that the event is associated with.
3. `parameters`, which includes safe numeric `metadata` and [unsafe arbitrarily-shaped `privateMetadata`](https://sourcegraph.com/docs/dev/background-information/telemetry#sensitive-attributes).

Extensive additional context is added by the extension itself (e.g. extension name and version) and the Sourcegraph backend (e.g. feature flags and actor information), so the event should only provide metadata about the specific action. Learn more in [events lifecycle](https://sourcegraph.com/docs/dev/background-information/telemetry#event-lifecycle).

For now, all events in VSCode should be updated to use both the legacy event clients and the new clients, for example:

```ts
// Legacy events client
import { telemetryService } from '../services/telemetry'
// New events client
import { telemetryRecorder } from '../services/telemetry-v2'

// Legacy instrumentation
telemetryService.log(
  'CodyVSCodeExtension:fixup:applied',
  { ...codeCount, source },
  // Indicate the legacy instrumentation has a coexisting v2 instrumentation
  { hasV2Event: true }
)
// New instrumentation, alonsgide the legacy instrumentation
telemetryRecorder.recordEvent('cody.fixup.apply', 'succeeded', {
  metadata: {
    /**
     * metadata, exported by default, must be numeric.
     */
    lineCount: codeCount.lineCount,
    charCount: codeCount.charCount,
  },
  privateMetadata: {
    /**
     * privateMetadata is NOT exported by default, because it can accidentally
     * contain data considered sensitive. Export of privateMetadata can be
     * enabled serverside on an allowlist basis, but requires a Sourcegraph
     * release.
     *
     * Where possible, convert the data into a number representing a known
     * enumeration of categorized values instead, so that it can be included
     * in the exported-by-default metadata field instead.
     *
     * Learn more: https://sourcegraph.com/docs/dev/background-information/telemetry#sensitive-attributes
     */
    source,
  },
})
```

When events are recorded to both systems:

1. `telemetryService` will _only_ send the event directly to dotcom's `event_logs`.
2. `telemetryRecorder` will make sure the connected instance receives the event in the new framework, if the instance is 5.2.0 or later, or translated to the legacy `event_logs` format, if the instance is older.
   1. In instances 5.2.1 or later, the event will [also be exported from the instance](https://sourcegraph.com/docs/dev/background-information/telemetry/architecture).

Allowed values for various fields are declared and tracked in [`lib/shared/src/telemetry-v2`](../lib/shared/src/telemetry-v2).
