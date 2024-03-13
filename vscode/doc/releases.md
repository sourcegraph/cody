# Releases

Releases of Cody for VS Code are available at:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) (most popular)
- [Open VSX Registry](https://open-vsx.org/extension/sourcegraph/cody-ai)
- [Manual `.vsix` downloads via GitHub releases](https://github.com/sourcegraph/cody/releases)

## Stable builds

Stable builds are released periodically (generally several times per week) and have version numbers of the form `0.even.n`, where `even` is an even number (such as `0.6.5`). Unless features are still being tested and not ready to be released, stable builds can be directly cut from main.

## Insiders builds

Insiders builds are for early adopters who want to test the latest changes. They are published at least daily and have version numbers of the form `0.odd.timestamp`, where `odd` is an odd number (such as `0.7.1690496380`).

To use the Cody insiders build in VS Code:

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai).
1. Select **Switch to Pre-release Version** in the extension's page in VS Code.
1. Wait for it to download and install, and then reload (by pressing **Reload Required**).

## Patch builds

A subset of stable builds. Any changes that includes minor fixes for bugs, security, or other issues that don't add new features should be a patch release. These changes should be cherry picked into the target version you want to patch. 

To release a patch version:
1. Branch off from the version intended for the patch (e.g., create branch `1.8.3` from tag `vscode-v1.8.2`).
2. Cherry pick the relevant commits from main into this new branch.
3. Tag this branch with the new patch version (ie - `vscode-v1.8.3`)
4. Create a separate PR to update the changelog, and bump the version in `vscode/package.json`
