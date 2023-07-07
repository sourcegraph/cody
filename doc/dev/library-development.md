# Developing the Cody library packages

The `cody` repository contains 2 npm packages that can be used by other applications to integrate Cody: `@sourcegraph/cody-shared` and `@sourcegraph/cody-ui`.

For example, the Sourcegraph web app uses these packages to provide Cody functionality on the web.

## Publishing new packages

1. Increment the `version` in `lib/shared/package.json` and `lib/ui/package.json`.
1. Commit and push the version increment.
1. Publish the new packages:

   ```shell
   pnpm -C lib/shared publish
   pnpm -C lib/ui publish
   ```

1. Update consumers to use the new published versions.

## Local development

For your local changes to `@sourcegraph/cody-{shared,ui}` to be immediately reflected in your application that consumes those libraries, use [`pnpm link`](https://pnpm.io/cli/link).

### Linking

In the consumer package (such as the `sourcegraph` repository's `client/web` directory), run:

```shell
pnpm link $CODY_REPO/lib/ui
pnpm link $CODY_REPO/lib/shared
```

In the `cody` repository, run:

```shell
pnpm link $CONSUMER_REPO/node_modules/react

pnpm -C lib/ui run build
pnpm run watch # keep this running
```

(Known issue: When you change a CSS file in `@sourcegraph/cody-ui`, you need to run `pnpm -C lib/ui run build` again for your changes to be reflected in the consumer package.)

### Unlinking

To return to using the published versions of the `@sourcegraph/cody-{shared,ui}` packages, use [`pnpm unlink`](https://pnpm.io/cli/unlink).

In the consumer package, run:

```shell
pnpm unlink $CODY_REPO/lib/ui
pnpm unlink $CODY_REPO/lib/shared
```

In the `cody` repository, run:

```shell
pnpm unlink $CONSUMER_REPO/node_modules/react
```
