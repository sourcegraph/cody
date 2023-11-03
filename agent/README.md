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

## Miscellaneous notes

- By the nature of using JSON-RPC via stdin/stdout, both the agent server and
  client run on the same computer and there can only be one client per server.
  It's normal for both the client and server to be stateful processes. For
  example, the `extensionConfiguration/didChange` notification is sent from the
  client to the server to notify that subsequent requests should use the new
  connection configuration.
