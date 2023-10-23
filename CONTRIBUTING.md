# Contributing to Sourcegraph JetBrains Plugin

Thank you for your interest in contributing to Sourcegraph! The goal of this
document is to provide a high-level overview of how you can contribute to the
Sourcegraph JetBrains Plugin.

## Issues / Bugs

New issues and feature requests can be filed through
our [issue tracker](https://github.com/sourcegraph/sourcegraph/issues/new?labels=team/integrations,jetbrains-ide&title=JetBrains:+)
using the `jetbrains-ide` & `team/integrations` labels.

## Development

- Install Java 11 via SDKMAN! https://sdkman.io. Once you have SDKMAN! installed, run `sdk use java 11.0.15-tem`.
  Confirm that you have Java 11 installed with `java -version`.
- Clone `https://github.com/sourcegraph/sourcegraph`
- Clone `https://github.com/sourcegraph/cody` in a sibling directory. The toplevel directories for
  sourcegraph/sourcegraph and sourcegraph/cody must be next to each other.
- Install the following two IntelliJ plugins to format Java and Kotlin on file save
    - https://plugins.jetbrains.com/plugin/8527-google-java-format
    - https://plugins.jetbrains.com/plugin/14912-ktfmt

| What                                                             | Command                                                                  |
|------------------------------------------------------------------|--------------------------------------------------------------------------|
| Run the plugin locally                                           | `./gradlew :runIDE`                                                      |
| Run the plugin locally with fresh build of Cody                  | `./gradlew -PforceAgentBuild=true :runIDE`                               |
| Run the plugin locally with fresh build of a local clone of Cody | `CODY_DIR=<path_to_cody> ./gradlew -PforceAgentBuild=true :runIDE`       |
| Run the plugin locally with fresh build of Code Search assets    | `./gradlew -PforceCodeSearchBuild=true :runIDE`                          |
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

## Publishing a new nightly version

Run the following script to publish a new **nightly** version

```shell
./scripts/push-git-tag-for-next-release.sh
```

This script runs `verify-release.sh`, which takes a long time to run with a clean cache, which is why we don't run it in
CI. When you have a local cache of IDEA installations then this script can run decently fast (~1-2min).

## Publishing a new stable version

This workflow is not automated yet. Our goal is to publish stable releases by promoting nightly releases that have been
manually tested. What we're missing is a script to download the zip file of a nightly release, correct the version
to be non-nightly and then upload it to the JetBrains Marketplace.

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
