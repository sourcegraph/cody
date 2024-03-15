# Cody CLI (experimental)

A command-line interface for Cody.

**Status:** experimental

## Usage

Set the `SRC_ENDPOINT` and `SRC_ACCESS_TOKEN` environment variables and then try:

```
# Build the agent:
pnpm -C ../agent build

# Build the dist/cli.bundle.js file and see help:
pnpm run cli --help

# Ask Cody a question (with no context):
pnpm run cli experimental chat -m 'what color is the sky?'

# Ask Cody a question (with Sourcegraph Enterprise repository context):
pnpm run cli experimental chat --context-repo github.com/sourcegraph/{sourcegraph,cody} --show-context -m 'how is authentication handled in sourcegraph/cody?'
```
