# Cody CLI (experimental)

A command-line interface for Cody.

**Status:** experimental

## Usage

Set the `SRC_ENDPOINT` and `SRC_ACCESS_TOKEN` environment variables:

```
# Sourcegraph URL (https://sourcegraph.com or a URL to an enterprise instance)
export SRC_ENDPOINT=https://sourcegraph.com

# Sourcegraph access token (created in Sourcegraph > User settings > Access tokens)
export SRC_ACCESS_TOKEN=sgp_0000000000_0000000000000000000
```

Then run:

```
npm install -g @sourcegraph/cody-agent

# Ask Cody a question (with no context):
cody-agent experimental-cli chat -m 'what color is the sky?'

# Ask Cody a question (with Sourcegraph Enterprise repository context):
cody-agent experimental-cli chat --context-repo github.com/sourcegraph/{sourcegraph,cody} --show-context -m 'how is authentication handled in sourcegraph/cody?'
```

## Development & feedback

Use the [Feedback on Cody CLI (experimental feature)](https://community.sourcegraph.com/t/feedback-on-cody-cli-experimental-feature/78) thread in the Sourcegraph community forum.

Issues and PRs appreciated!

## Releases

The CLI is built and published as part of the [Cody Agent](../agent/README.md).
