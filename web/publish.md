# Publishing @sourcegraph/cody-web

This document outlines the steps to publish the `@sourcegraph/cody-web` package.

## Prerequisites
- Access to publish to the @sourcegraph organization on npm.
- `pnpm login` using credentials from [1pass](https://start.1password.com/open/i?a=HEDEDSLHPBFGRBTKAKJWE23XX4&v=dnrhbauihkhjs5ag6vszsme45a&i=oye4u4faaxmxxesugzqxojr4q4&h=team-sourcegraph.1password.com).

## Versioning Guidelines

- For each new regular release, update the minor version (X.Y.Z → X.Y+1.0)
- For bug fixes and patches between the releases, update the patch version (X.Y.Z → X.Y.Z+1)

## Step 1: Update Versions

1. In the cody repo go to the `web` folder (i.e. `cd cody/web`), Update the version number in `./package.json`:

2. In the Sourcegraph repository:
   ```bash
   # cd ../sourcegraph
   # In client/web-sveltekit/package.json, update @sourcegraph/cody-web version
   ```

## Step 2: Test Locally

Before publishing, it's important to test the package locally within the Sourcegraph client:

1. Build the package:
   ```bash
   cd cody/web
   pnpm build
   ```

2. Create a global link for local testing:
   ```bash
   pnpm link --global
   ```

3. In the Sourcegraph repository:
   ```bash
   cd sourcegraph
   cd client/web-sveltekit/ && pnpm link @sourcegraph/cody-web --global && cd ../web && pnpm link @sourcegraph/cody-web --global && cd ../../
   ```

4. Add the following configuration to `sg.config.overwrite.yaml`:
   ```yaml
   commands:
    web-standalone-http:
      install: |
        pnpm run generate
    web-sveltekit-server:
      install: |
        pnpm run generate
   ```

5. Run Sourcegraph locally to test:
   ```bash
   sg start web-standalone
   ```

6. If you encounter login issues with web-standalone, try the following:
   - Manually comment out the `pnpm install` commands in the `sg.config.yaml` file
   - Then run `sg start` directly

7. Verify that the package works as expected in the Sourcegraph client:
   - Go to code search and verify all Cody components are working correctly (prompt interface, model selector, etc.)
   - Test Cody with a file to ensure it works properly

## Step 3: Commit Changes in Cody Repository

1. Create a commit with the version bump:
   ```bash
   git add package.json
   git commit -m "chore: bump @sourcegraph/cody-web version to X.X.X"
   ```

2. Get the PR reviewed and merged

## Step 4: Publish the Package

Once the version bump is merged in the Cody repository:

1. Ensure you're logged in to npm:
   ```bash
   npm login
   ```

2. Build the package for production:
   ```bash
   pnpm build
   ```

3. Publish the package:
   ```bash
   pnpm publish
   ```

## Step 5: Update Sourcegraph Repository

1. Create a commit with the version updates:
   ```bash
   git add client/web-sveltekit/package.json client/web/package.json
   git commit -m "chore: update @sourcegraph/cody-web version to X.X.X"
   ```

2. Get the PR reviewed and merged
