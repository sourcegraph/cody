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
