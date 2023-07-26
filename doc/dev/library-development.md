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

In the consumer package (such as the `sourcegraph` repository's `client/web` directory), _after_ you've run `sg start`, run:

```shell
pnpm link $CODY_REPO/lib/ui
pnpm link $CODY_REPO/lib/shared
```

In the `cody` repository, run:

```shell
pnpm link $CONSUMER_REPO/node_modules/react
```

After each change in the `cody` repository, run:

```shell
pnpm -C lib/ui run build && pnpm -C lib/shared run build
```

Known issues:

1. When working with the `sourcegraph` repository, if you run the `pnpm link $CODY_REPO/lib/...` commands above _before_ running `sg start`, Bazel will complain. You need to run those commands after `sg start` and any Bazel commands you must run. If you need to get back to a clean slate to run Bazel, just revert the `sourcegraph` repository's `/pnpm-lock.yaml` file.
1. You should be able to just run `pnpm run watch` from the `cody` repository, but that is not currently working.

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
