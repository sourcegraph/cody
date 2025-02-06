# Contributing to Cody for VS Code

## Getting started

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Open this repository in VS Code and run the `Launch VS Code Extension (Desktop, recommended)` build/debug task (or run `cd vscode && pnpm run build && pnpm run dev`).

Tip: Enable `cody.debug.verbose` in VS Code settings during extension development.

## File structure

- `src`: source code of the components for the extension host
- `webviews`: source code of the extension sidebar webviews, built with Vite
- `test`: [tests](test/README.md)
- `dist`: build outputs from both esbuild and vite
- `resources`: everything in this directory will be moved to the ./dist directory automatically during build time for easy packaging
- `index.html`: the entry file that Vite looks for to build the webviews. The extension host reads this file at run time and replace the variables inside the file with webview specific uri and info

## Architecture

Read [ARCHITECTURE.md](../ARCHITECTURE.md) and follow the principles described
there.

## Reporting autocomplete issues

The best way to help us improve code completions is by contributing your examples in the [Unhelpful Completions](https://github.com/sourcegraph/cody/discussions/358) discussion together with some context of how the autocomplete request was build.

### Accessing autocomplete logs

1. Enable `cody.debug.verbose` in VS Code settings
   - Make sure to restart or reload VS Code after changing these settings
1. Open the Cody debug panel via "View > Output" and selecting the "Cody by Sourcegraph" option in the dropdown.

### Realtime autocomplete tracing

We also have some build-in UI to help during the development of autocomplete requests. To access this, run the `Cody > Open Autocomplete Trace View` action. This will open a new panel that will show all requests in real time.

## Testing

- Unit tests: `pnpm run test:unit`
- Integration tests: `pnpm run test:integration`
- End-to-end tests: `pnpm run test:e2e`

## Releases

See [Cody Client Releases.](https://sourcegraph.notion.site/sourcegraph/Cody-Client-Releases-82244a6d1d90420d839f432b8cc00cd8)

### Running a release build locally

It can be helpful to build and run the packaged extension locally to replicate a typical user flow.

To do this:

1. Run `pnpm install` (see [repository setup instructions](../doc/dev/index.md) if you don't have `pnpm`).
1. Run `CODY_RELEASE_TYPE=stable pnpm release:dry-run`
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

Run the web build from /web  `pnpm install && pnpm dev` to reduce time spent waiting on extension builds. This is helpful for roughing in features, but you should always test the extensions in their proper environments.

Run `pnpm biome` to discover buildtime errors early.

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

### Capturing network traffic

Viewing the "network" tab in the developer tools often excludes most network traffic done by extensions. Instead you can use a tool like [mitmproxy](https://mitmproxy.org/) or [Proxyman](https://proxyman.io/) as a proxy that will capture all the traffic. Assuming the proxy is listening on port 8080, you can set the following environment variables when starting up `code` or running a test:

```sh
export NODE_TLS_REJECT_UNAUTHORIZED=0
export http_proxy=http://127.0.0.1:8080
export GLOBAL_AGENT_HTTP_PROXY="$http_proxy"
export HTTPS_PROXY="$http_proxy"

# Capture all requests in vscode. Note: requires starting up a new instance of code.
code

# Run a specific e2e test and capture the network requests
pnpm -C vscode test:e2e:run attribution.test.ts:10
```
