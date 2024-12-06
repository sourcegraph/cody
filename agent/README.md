# Cody Agent

The `@sourcegraph/cody-agent` package implements a JSON-RPC server to interact
with Cody via stdout/stdin. This package is intended to be used by
non-ECMAScript clients such as the JetBrains and NeoVim plugins.

## Releases

Cody Agent releases are available:

- as self-contained executables for various platforms at [Cody Agent releases](https://github.com/sourcegraph/cody/releases) on GitHub
- from the `@sourcegraph/cody-agent` npm package (`npx @sourcegraph/cody-agent help`)

To build and publish a release using GitHub Actions, bump the version number in the agent's [package.json](package.json) and then push to the `agent-vN.N.N` tag (where `N.N.N` is that version number).

## Protocol

The protocol is defined in the file [`protocol.ts`](../vscode/src/jsonrpc/agent-protocol.ts). The TypeScript code is the single source of truth of what JSON-RPC methods are
supported in the protocol.

## Updating the protocol

Directly edit the TypeScript source code to add new JSON-RPC methods or add
properties to existing data structures.

The agent is a new project that is being actively worked on at the time of this
writing. The protocol is subject to breaking changes without notice. Please
let us know if you are implementing an agent client.

## Client bindings

There's no tool to automatically generate bindings for the Cody agent protocol.
Currently, clients have to manually write bindings for the JSON-RPC methods.

## Useful commands

The following commands assume you are in the `agent` directory:

| Command                                                                  | What                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                             | Build `dist/index.js` Node.js script for running the agent                                                                                   |
| `node dist/index.js`                                                     | Run the agent after `pnpm build`. You normally do this from a client integration.                                                            |
| `node --inspect dist/index.js`                                           | Run the agent with debugging enabled (see `chrome://inspect/`, [more details](https://nodejs.org/en/docs/guides/debugging-getting-started/)) |
| `pnpm run test`                                                          | Run all agent-related tests                                                                                                                  |
| (optional) `src login`                                                   | Make sure you are logged into your Sourcegraph instance, which is required to run the e2e test in `index.test.ts`                            |
| `pnpm run test src/index.test.ts`                                        | Run e2e test, requires `src login` to work.                                                                                                  |

The following commands assume you are in the root directory of this repository:

| Command                                                                                                              | What                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test agent/src/index.test.ts`                                                                                  | Run agent tests in replay mode                                                                                                                                |
| `source agent/scripts/export-cody-http-recording-tokens.sh`                                                          | Export access tokens to enable recording mode                                                                                                                 |
| `pnpm update-agent-recordings`                                                                                            | Update HTTP recordings for all tests. Run this before opening a PR                                                                                            |
| `CODY_KEEP_UNUSED_RECORDINGS=true CODY_RECORD_IF_MISSING=true pnpm run test agent/src/index.test.ts`                 | Run this when iterating on a feature and you only want to run an individual test via `it.only`. Remember to run `pnpm update-agent-recordings` before sending a PR |
| `CODY_KEEP_UNUSED_RECORDINGS=true CODY_RECORD_IF_MISSING=true npx vitest agent/src/index.test.ts -t 'squirrel test'` | Run only a single test without making changes to the code                                                                                                     |
| `./agent/scripts/reset-recordings-to-main.sh` | Overwrites the local HTTP recordings with the recordings from origin/main. Useful when preparing a PR for review. |
| `./agent/scripts/resolve-recordings-git-conflict.sh` | Resolves git conflicts in HTTP recording files by picking the recordings on the other branch. Requires you to re-record changes in your branch. |
| `pnpm agent cody-bench --help` | See available flags in `cody-bench` tool. |
| `pnpm agent:skip-root-build cody-bench --evaluation-config ~/dev/sourcegraph/cody-bench-data/fix-bench.json --test-count 1 --include-fixture gpt-4o` | Run cody-bench against evaluation config. Only do a single test with the gpt-4o fixture. More details in the [sourcegraph/cody-bench-data](https://github.com/sourcegraph/cody-bench-data) repo. |

## Debugging the agent

- The best way to troubleshoot a problem with the agent is to run
  `pnpm run test src/index.test.ts` because it gives you the fastest feedback
  loop. You can easily add a new test case with custom JSON-RPC
  requests/notifications to reproduce the issue you are troubleshooting. One
  important benefit of this workflow is that you get nice stack traces point to
  the original TypeScript source code.
- To see all incoming/outcoming JSON-RPC traffic, set the environment variable
  `CODY_AGENT_TRACE_PATH=/somewhere.json` and use `tail -f /somewhere.json` to
  watch the trace file while running the agent. This is particularly helpful to confirm
  whether your client is sending the expected JSON-RPC requests/notifications
  and getting the expected responses.
- If you have access to stderr of the agent process, you can add
  `console.log(...)` statements throughout the TypeScript code to trace values at
  specific points. This is a good fallback when the other debugging workflows are
  not sufficient.

## Client implementations

- The Sourcegraph JetBrains plugin is defined in the `sourcegraph` repository's
  [`client/jetbrains`](https://github.com/sourcegraph/sourcegraph/tree/main/client/jetbrains)
  directory. The `CodyAgentClient.java` file implements the client side of the
  protocol.
- The Sourcegraph Neovim plugin is defined in the
  [`sourcegraph/sg.nvim`](https://github.com/sourcegraph/sg.nvim) repository.

## Testing with the agent

The agent includes a testing mode where it can either record HTTP requests or
replay from a directory of recorded HTTP request/response pairs. When running
in replay mode, the agent should be suitable to use within tests because the results
should be determinic and work.

To run the agent in testing mode, define the following environment variables:

- `CODY_RECORDING_DIRECTORY=PATH_TO_DIRECTORY`: a directory where the HTTP
  recordings should be stored. This directory should be committed to git so that
  other people who clone the repository can replay from the same recording.
- `CODY_RECORDING_MODE=record|replay|passthrough`: when set to `record`, will record HTTP
  requests and persist the results in the recording directory. When set to
  `replay`, will replay from the recording directory. When set to `passthrough`,
  will pass through all HTTP requests to the real Sourcegraph instance without
  recording the responses.
- (optional) `CODY_RECORDING_MODE=TEST_NAME`: if you are running multiple
  instances of the agent to test different features, then you should provide a
  unique recording name for each test. Each unique name will get a unique
  directory avoiding the risk of contaminating recordings between different
  tests.

Run `pnpm run agent jsonrpc --help` to get more information about all available
`--recording-*` options.

## Updating the Polly HTTP Recordings

If agent tests are failing in CI for non-agent related PRs (e.g. `PollyError:
[Polly] [adapter:node-http] Recording for the following request is not found and
recordIfMissing is false` errors) then you may need to update the HAR HTTP
recordings. For example, this can happen when we make changes to the prompt the
agent test to not be able to replay the autocomplete requests from old
recordings.

Before you start, make sure you have Sourcegraph CLI installed. 
See: [Installation in Quickstart for src](https://sourcegraph.com/docs/cli/quickstart#installation).

To fix this problem, update the HTTP recordings with the following command:

```sh
# tokens are redacted in the recordings
source agent/scripts/export-cody-http-recording-tokens.sh
src login                                     # confirm you are authenticated to sourcegraph.com
pnpm update-agent-recordings                  # run tests to update recordings
# If test fails, press `u` to update the vitest snapshot assertion.
pnpm run test agent/src/index.test.ts         # validate that tests are passing successfully in replay mode
```

On Windows, install `gcloud` and the Sourcegraph client `src`, then:

```powershell
gcloud auth login  # log in to Sourcegraph
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass  # allow running scripts
& .\agent\scripts\export-cody-http-recording-tokens.ps1
pnpm update-agent-recordings-windows
```

Please post in #wg-cody-agent if you have problems getting the agent tests to
pass after recording. Worst case, feel free to disable the agent tests by
uncommenting the block of code in `index.test.ts`. See comment in the code for
more details about how to disable agent tests.

## Iterating on agent tests

For a fast edit/test/debug feedback loop when iterating on agent tests, use the `CODY_RECORD_IF_MISSING=true` mode.

```sh
CODY_RECORD_IF_MISSING=true pnpm run test agent/src/index.test.ts
```

The benefit of this workflow is that the agent replays from the HTTP recording
for tests that haven't changed, and only sends HTTP requests for new tests.

When you are happy with the result, make sure to run `pnpm
update-agent-recordings` to clean unused recordings.

## Miscellaneous notes

- By the nature of using JSON-RPC via stdin/stdout, both the agent server and
  client run on the same computer and there can only be one client per server.
  It's normal for both the client and server to be stateful processes. For
  example, the `extensionConfiguration/didChange` notification is sent from the
  client to the server to notify that subsequent requests should use the new
  connection configuration.
- Run the command `git diff -- ':!*.har.yaml'` to review local changes without the noisy
  diff in `agent/recordings`.
- If you get an ESBuild error about "You can mark the path "#async_hooks" as
  external to exclude it from the bundle, which will remove this error." then the
  fix is to remove dependencies on `vitest` from the agent bundle. Vitest depends
  on the `p-limit` npm package, which uses `#async_hooks` that we currently don't
  handle in the ESBuild config.
