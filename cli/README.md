# Cody CLI (experimental)

A command-line interface for Cody. Important note: this tool used to be called `cody-agent` but was renamed to just `cody`.

**Status:** experimental

## Changelog

See [CHANGELOG.md](../agent/CHANGELOG.md).

## Usage

Run the following commands to get started with the Cody CLI:

```
npm install -g @sourcegraph/cody

# Authenticate with Sourcegraph by opening a browser window
cody auth login --web

# Ask Cody a question (with no context):
cody chat -m 'what color is the sky?'

# Ask Cody a question (with Sourcegraph Enterprise repository context):
cody chat --context-repo github.com/sourcegraph/{sourcegraph,cody} --show-context -m 'how is authentication handled in sourcegraph/cody?'
```

## Development & feedback

Use the [Feedback on upcoming Cody CLI Beta](https://community.sourcegraph.com/t/share-your-feedback-on-the-upcoming-cody-cli-beta/672) thread in the Sourcegraph community forum.

Issues and PRs appreciated!

## Releases

The CLI is built and published as part of the [Cody Agent](../agent/README.md).
