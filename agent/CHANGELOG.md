# Changelog

This is a log of all notable changes to the Cody command-line tool. [Unreleased] changes are for upcoming releases.

## [Unreleased]

### Added

### Fixed

### Changed

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
