# features.json5

The goal of this system is to track the status of fine-grained features across the Cody product line, in all editors, with minimal toil. Product features are described in a [JSON5](https://json5.org/) file. The file is checked in making it easy to relate feature status to commit history.

A tool semantically merges feature files across repositories. This allows common data, such as links to documentation, to be stored in one place. But by splitting editor-specific status into their respective repositories, engineers don't have to deal with multi-repo PRs. They can land status updates and code in one repository in a single commit.

By semantically diffing the feature files it is possible to view what features have changed from release to release, or show the feature gap that exists between editors.

## Command Line Tool

**Set up the tool:**

```
$ pnpm install  # Set up dependencies
```

**Merge feature files.** The merged result is printed to the console. For example, for a complete description of JetBrains features it is necessary to merge the features.json5 file in the sourcegraph/cody repo, which has documentation links, etc. with the features.json5 file in the sourcegraph/jetbrains repo, which has the overlay feature data for JetBrains specifically.

```
$ pnpm features merge featuresA.json5 featuresB.json5 ...
```
