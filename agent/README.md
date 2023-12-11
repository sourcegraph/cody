# Cody Agent

The `@sourcegraph/cody-agent` package implements a JSON-RPC server to interact
with Cody via stdout/stdin. This package is intended to be used by
non-ECMAScript clients such as the JetBrains and NeoVim plugins.

## Protocol

The protocol is defined in the file [`protocol.ts`](../vscode/src/jsonrpc/agent-protocol.ts). The
TypeScript code is the single source of truth of what JSON-RPC methods are
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
| `pnpm build-agent-binaries`                                              | Build standalone binaries for macOS, Linux, and Windows to `dist/` directory.                                                                |
| `AGENT_EXECUTABLE_TARGET_DIRECTORY=/somewhere pnpm build-agent-binaries` | Build standalone binaries for macOS, Linux, and Windows to `/somewhere` directory                                                            |
| `pnpm run test`                                                          | Run all agent-related tests                                                                                                                  |
| (optional) `src login`                                                   | Make sure you are logged into your Sourcegraph instance, which is required to run the e2e test in `index.test.ts`                            |
| `pnpm run test src/index.test.ts`                                        | Run e2e test, requires `src login` to work.                                                                                                  |

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

To fix this problem, update the HTTP recordings with the following command:

```sh
export SRC_ACCESS_TOKEN=sgp_YOUR_ACCESS_TOKEN # redacted in the recordings
export SRC_ENDPOINT=https://sourcegraph.com   # tests run against dotcom
src login                                     # confirm you are authenticated to sourcegraph.com
CODY_RECORDING_MODE=record pnpm run test      # run tests to update recordings
pnpm run test                                 # confirm that tests are passing when replaying HTTP traffic
```

Please post in #wg-cody-agent if you have problems getting the agent tests to
pass after recording. Worst case, feel free to disable the agent tests by
uncommenting the block of code in `index.test.ts`. See comment in the code for
more details about how to disable agent tests.

## Miscellaneous notes

- By the nature of using JSON-RPC via stdin/stdout, both the agent server and
  client run on the same computer and there can only be one client per server.
  It's normal for both the client and server to be stateful processes. For
  example, the `extensionConfiguration/didChange` notification is sent from the
  client to the server to notify that subsequent requests should use the new
  connection configuration.
