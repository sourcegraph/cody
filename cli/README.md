# Cody CLI (experimental)

Cody CLI is an experimental command-line interface for Cody.

## Getting started

```shell
pnpm run build
```

Then ask a question.

<pre><code>
$ <strong>export SRC_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa</strong> # Sourcegraph access token
$ <strong>node dist/app.js</strong>

✔ What do you want to ask Cody? … <strong>Where is data stored?</strong>
 Data in Sourcegraph is stored in the following places:

...
</code></pre>

Use `--help` for a list of command-line options.

## Development

```shell
pnpm run start
```

### Release

To publish a new release of the `@sourcegraph/cody-cli` package:

1. Increment the `version` in [`package.json`](package.json).
1. Commit the version increment.
1. `git tag cli-v$(jq -r .version package.json)`
1. `git push --tags`
1. Wait for the [cli-release workflow](https://github.com/sourcegraph/cody/actions/workflows/cli-release.yml) to finish.
