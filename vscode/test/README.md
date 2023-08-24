# Testing Cody VScode

Cody VScode has four kinds of tests:

1. Unit tests. These are stored alongside the code in files named `.test.ts`.
   They are written in vitest and use VScode mocks. Run them with `pnpm test:unit`.

2. Storybook. These are in the `webviews` directory in files named `.story.tsx`.
   These render UI widgets and use VScode mocks. Run them with `pnpm storybook`.

3. Integration tests, in `integration`. These run VScode and communicate with
   the Cody extension directly through a "testing" API returned by the extension
   after it activates. They use a mock server. Run them with `pnpm test:integration`.

4. [End-to-end tests,](e2e/README.md) in `e2e`. These run VScode and interact with
   the VScode UI using Playwright. These cover more code than the integration tests
   but are harder to write and maintain because they don't have direct access to the
   Cody extension. Run them with `pnpm test:e2e`.
