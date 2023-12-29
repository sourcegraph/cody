# Contributing to Sourcegraph JetBrains Plugin

Thank you for your interest in contributing to Sourcegraph! The goal of this
document is to provide a high-level overview of how you can contribute to the
Sourcegraph JetBrains Plugin.

## Issues / Bugs

New issues and feature requests can be filed through
our [issue tracker](https://github.com/sourcegraph/cody/issues/new/choose).

## Development

- Install Java 11 via SDKMAN! https://sdkman.io. Once you have SDKMAN! installed, run `sdk use java 11.0.15-tem`.
  Confirm that you have Java 11 installed with `java -version`.
- Clone `https://github.com/sourcegraph/sourcegraph`
- Clone `https://github.com/sourcegraph/cody` in a sibling directory.
  The toplevel directories for sourcegraph/sourcegraph and sourcegraph/cody must be next to each other.
- Install the following two IntelliJ plugins to format Java and Kotlin on file save
    - https://plugins.jetbrains.com/plugin/8527-google-java-format
    - https://plugins.jetbrains.com/plugin/14912-ktfmt

Few tips and tricks regarding versioning of the tooling:

- If you are using macOS make sure to install `pnpm`  version `8.6.7`  using `corepack` and
  not `brew`: `corepack install --global pnpm@8.6.7`.
  Currently `brew` does not allow you to pick custom `pnpm` version which is
  causing [various issues](https://github.com/pnpm/pnpm/issues/6903).
- Use `node` version `18` (newer versions causes hard to diagnose errors with `ERR_INVALID_THIS`).
- If you changed `pnpm` or `node` version after running gradle you need to kill gradle daemon with `./gradlew --stop`.
  Otherwise you won't see effects of your changes.
- Running `:runIde PplatformRuntimeVersion=X.Y` for the first time might fail due to missing IntelliJ installation. You
  can fix it by running `:runIde PplatformVersion=X.Y` once - even if compilation fails it fixes your caches.

| What                                                             | Command                                                                  |
|------------------------------------------------------------------|--------------------------------------------------------------------------|
| Run the plugin locally                                           | `./gradlew :runIDE`                                                      |
| Run the plugin locally with fresh build of Cody                  | `./gradlew -PforceAgentBuild=true :runIDE`                               |
| Run the plugin locally with fresh build of a local clone of Cody | `CODY_DIR=<path_to_cody> ./gradlew -PforceAgentBuild=true :runIDE`       |
| Run the plugin locally with fresh build of Code Search assets    | `./gradlew -PforceCodeSearchBuild=true :runIDE`                          |
| Run the plugin locally with different IntelliJ version           | `./gradlew -PplatformRuntimeVersion=2023.1 :runIDE`                      |
| Build Code Search assets (separate terminal)                     | `pnpm build`                                                             |
| Continuously re-build Code Search assets (separate terminal)     | `pnpm watch`                                                             |
| Code Search "Find with Sourcegraph" window                       | `pnpm standalone && open http://localhost:3000/`                         |
| Build deployable plugin                                          | `./gradlew buildPlugin` (artifact is generated in `build/distributions`) |
| Reformat Java and Kotlin sources                                 | `./gradlew spotlessApply`                                                |
| Debug agent JSON-RPC communication                               | `tail -f build/sourcegraph/cody-agent-trace.json`                        |

## Using Nightly channel releases

- Open "Sourcegraph & Cody" settings
- Change to "Nightly" update channel
- Open "Plugins"
- Update Sourcegraph plugin
- Restart IDE

Remove the URL from the plugin repository list to go back to the stable channel.

### Wiring unstable-codegen via SOCKS proxy

**INTERNAL ONLY** This section is only relevant for Sourcegraph engineers.
Take the steps below _before_ [running JetBrains plugin with agent](#developing-jetbrains-plugin-with-the-agent).

- Point IntelliJ provider/endpoint at the desired LLM endpoint by editing `$HOME/.sourcegraph-jetbrains.properties`:
  ```
  cody.autocomplete.advanced.provider: unstable-codegen
  cody.autocomplete.advanced.serverEndpoint: https://backend.example.com/complete_batch
  ```
- Run `gcloud` SOCKS proxy to access the LLM backend:
    - Make sure to authorize with GCP: `gcloud auth login`
    - Request Sourcegraph GCP access through Entitle.
    - Bring up the proxy:
      ```
      gcloud --verbosity "debug" compute ssh --zone "us-central1-a" "codegen-access-test" --project "sourcegraph-dogfood" --ssh-flag="-D" --ssh-flag="9999" --ssh-flag="-N"
      ```
    - Patch in [sg/socks-proxy](https://github.com/sourcegraph/cody/compare/sg/socks-proxy?expand=1).
      Note: After [#56254](https://github.com/sourcegraph/sourcegraph/issues/56254) is resolved this step is not needed
      anymore.

## Publishing a New Release

We plan to make releases every other Monday. Nightly version can be released as often as there is a need.

### 1. Push a Git Tag

First, choose whether to publish a new version of nightly or stable.

Use the following command for a **nightly** release:

```shell
./scripts/push-git-tag-for-next-release.sh --nightly
```

Or this one for a **stable** release:

```shell
./scripts/push-git-tag-for-next-release.sh --stable
```

This script runs `verify-release.sh`, which takes a long time to run with a clean cache, which is why we don't run it in
CI. When you have a local cache of IDEA installations then this script can run decently fast (~1-2min).

After successfully pushing the new tag (for example: `v5.2.4819` or `v5.2.4249-nightly`), we are now able to publish.

Wait for the `Release to Marketplace` GitHub workflow to complete.

### 2. Publish a New Release on GitHub

For every stable release, create a GitHub release summarizing the changes.

Visit [releases page](https://github.com/sourcegraph/jetbrains/releases) and click `Draft a new release`, choose your
tag and use `Generate release notes`. Release notes should appear automatically. Be aware that the automatic release are
based on the history of commits, so sometimes the titles are not properly formatted, capitalized or grammatically
correct. **This may sometimes require manual tweaks.**

Try to maintain a similar style to that of the previous releases, similar
to [our first release](https://github.com/sourcegraph/jetbrains/releases/tag/v5.2.2301).

It's also optional create GitHub releases for nightly builds where it makes sense.

### 3. Announce the New Release on our internal Slack channel

It is mandatory to post about both stable and nightly releases on our internal `wg-cody-jetbrains` Slack channel. You
can refer to past posts in the channel's history for examples.

## Enabling web view debugging

Parts of this extension rely on the [JCEF](https://plugins.jetbrains.com/docs/intellij/jcef.html) web view features
built into the JetBrains platform. To enable debugging tools for this view, please follow these steps:

1. [Enable JetBrains internal mode](https://plugins.jetbrains.com/docs/intellij/enabling-internal.html)
2. Open Find Actions: (<kbd>Ctrl+Shift+A</kbd> / <kbd>⌘⇧A</kbd>)
3. Search for "Registry..." and open it
4. Find option `ide.browser.jcef.debug.port`
5. Change the default value to an open port (we use `9222`)
6. Restart IDE
7. Open the “Find with Sourcegraph” window (<kbd>Alt+A</kbd> / <kbd>⌥A</kbd>)
8. Switch to a browser window, go to [`localhost:9222`](http://localhost:9222), and select the Sourcegraph window.
   Sometimes it needs some back and forth to focus the external browser with the JCEF component also focused—you may
   need to move the popup out of the way and click the external browser rather than using <kbd>Alt+Tab</kbd> / <kbd>
   ⌘Tab</kbd>.
