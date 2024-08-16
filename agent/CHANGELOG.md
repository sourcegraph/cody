# Changelog

This is a log of all notable changes to the Cody command-line tool. [Unreleased] changes are for upcoming releases.

## [Unreleased]

### Added

### Fixed

### Changed

## 5.5.12

### Fixed

- `cody chat --context-file` will now fail fast if the provided file is too
  large to fit into the context window. Previously, `cody chat` silently ignored
  this error and the LLM would respond with a confusing message about missing
  context. To bypass this check, use `--ignore-context-window-errors`.

## 5.5.11

### Fixed

- The `cody chat --show-context` flag now correctly prints out the used context for `--context-repo` and `--context-file`.

## 5.5.10

### Fixed

- Running `cody chat` should no longer report errors related to autocomplete
- Running `cody chat --context-repo REPO` now reports a helpful error if the provided repo does not exist on the instance.

## 5.5.9

### Added

- New `cody chat --stdin` option to send a message to the Cody chat from stdin. Can be combined with `--message` like `git diff | cody chat --stdin -m 'Explain this diff'`.
- Trailing arguments are now added to the chat message as space-separated words. Example: `cody chat explain react hooks`. When the trailing arguments are exactly the string `-`, the message is read from stdin (equivalent to `cody chat --stdin`).

### Fixed

- It's now possible to explicitly use the `--endpoint` and `--access-token` options.
- The `--context-repo` option now works correctly when used with a Sourcegraph Enterprise account.
- The `--context-repo` option now errors with a helpful explanation when not used with a Sourcegraph Enterprise account. Previously, it silently did the wrong thing for Sourcegraph.com accounts.
- The CLI should work correctly for Enterprise instances that use context filters. Previously, the chat would fail with a cryptic error message about an invalid client name.

## 0.2.0

### Changed

- `cody-agent` is now just `cody`. Install the `@sourcegraph/cody` npm package instead of `@sourcegraph/cody-agent`.
- `cody-agent jsonrpc` is now `cody api jsonrpc-stdio`. If you previously relied on calling `node agent/dist/index.js`, now you need to call `node agent/dist/index.js api jsonrpc-stdio`.
- `cody-agent server` is now `cody api jsonrpc-websocket`
- `cody-agent cody-bench` is now `cody internal bench`
- Running `cody` now prints out the help message instead of defaulting to the old `cody-agent jsonrpc` command.

## 0.1.2

### Changed

- The "service account name" for storing secrets is now formatted as "Cody:
  $SERVER_ENDPOINT ($USERNAME)" instead of "Cody" making it easier to
  understand what account/endpoint is stored there.

### Fixed

- Running `cody help` should work now. It was previously crashing about a missing keytar dependencies.

## 0.1.1
### Fixed

- Running `npm install -g @sourcegraph/cody-agent` should work now. It was previously crashing about a missing keytar dependency.

## 0.1.0

### Added

- New command `auth login --web` to authenticate the cli through the browser. The access token is stored in the operating system's secret storage (Keychain on macOS, Credential Vault on Windows, Secret Service API/libsecret on Linux).
- New command `auth login --access-token` to authenticate with an access token or `SRC_ACCESS_TOKEN` environment variable.
- New command `auth logout` to log out of the cli.
- New command `auth whoami` to determine what account is logged in.
- New command `auth accounts` to list all available Sourcegraph accounts.
- New command `auth settings-path` to print the JSON file path where non-sensitive configuration is stored.

### Changed

- The `chat` command now runs faster
- The `chat` command now prints the reply to the standard output stream instead of system error.
- The `chat` command now interacively streams the reply to system error. Use `--silent` to disable interactive streaming.
