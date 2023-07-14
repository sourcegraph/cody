# Cody CLI (experimental)

Cody CLI is an experimental command-line interface for Cody.

## Getting started

```shell
pnpm run build
```

Then ask a question:

<pre><code>
$ <strong>export SRC_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa</strong> # Sourcegraph access token
$ <strong>dist/cody</strong>

✔ What do you want to ask Cody? … <strong>Where is data stored?</strong>
 Data in Sourcegraph is stored in the following places:

...
</code></pre>

Or have it write a commit message for your Git changes:

```shell
$ dist/cody commit --dry-run
```

Use `--help` for more information.

## Development

```shell
pnpm run start
```
