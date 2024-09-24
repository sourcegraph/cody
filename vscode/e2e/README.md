# End-To-End Testing


- [End-To-End Testing](#end-to-end-testing)
  - [Fundamental Principles](#fundamental-principles)
  - [Quick Start](#quick-start)
    - [Running tests](#running-tests)
    - [Updating Recordings](#updating-recordings)
  - [Overview](#overview)
    - [1. Playwright](#1-playwright)
    - [2. Fixture](#2-fixture)
      - [2.1 Configuration](#21-configuration)
      - [2.2 VSCode Server](#22-vscode-server)
      - [2.3 MitM Server / PollyJS](#23-mitm-server--pollyjs)
      - [2.4 Workspace](#24-workspace)
    - [3. UIX (User Interaction Extensions)](#3-uix-user-interaction-extensions)
    - [4. Tests](#4-tests)
    - [5. Isolated Resources](#5-isolated-resources)
    - [6. Test Artifacts](#6-test-artifacts)
  - [Writing Great Tests](#writing-great-tests)
      - [What Causes Flake?](#what-causes-flake)
        - [1. **Clicks are _not_ immediate**](#1-clicks-are-not-immediate)
        - [2. **Networks are _not_ predicatble**](#2-networks-are-not-predicatble)
        - [3. **State is _not_ for sharing**](#3-state-is-not-for-sharing)
      - [What's the Solution?](#whats-the-solution)
    - [Locators](#locators)
      - [Webviews](#webviews)
    - [Clicks](#clicks)
      - [Commands \> Clicks](#commands--clicks)
      - [Macros \> Commands](#macros--commands)
    - [Setup](#setup)
      - [Authentication](#authentication)
      - [Workspace](#workspace)
    - [Network](#network)
      - [Recordings](#recordings)
      - [Mocking](#mocking)
    - [Telemetry](#telemetry)
      - [Snapshots](#snapshots)
  - [Next Steps](#next-steps)


## Fundamental Principles

- **DX > Testing**. Nobody likes writing and maintaining tests. The hope is that by prioritizing DX we can make this toolbox much more broadly applicable in your dev workflow. Making the tests a mere side-effect from a great way to hack on a feature.
- **Reality > Mocking**. Flags such as `env.TESTING_ENABLED`, manual mocks, etc. often significantly alter the code-paths when compared to a production release. This framework aims to bring together tools such as recordings, snapshot testing, production quality vscode server, and more, to ensure that tests are actually equivalent or at least representative to running the code in production.
- **Parallel > DRY**. By maticulously isolating every aspect of a test we allow tests to run fully in parallel (even within a single test file). This does mean that at times a individual test might replicate behaviour of an adjacent test. However it is often much easier to parallelize tests across the machine(s) so it's a tradeoff worth making.
- **Never Flake > Retries**. Test retries just hide flake. And flake is the root of all evil.
- **Decelerative > Procedural**. Tests should read like a declaration of exepcted behaviour, not as a series of scattered locator matches and clicks.

## Quick Start

### Running tests
```sh
cd vscode

#Note: these flags and options can be combined. Use the --help flag for more options and details.

pnpm run test:e2e2 # builds & then runs all tests
pnpm run test:e2e2:run # skips build and runs all tests
pnpm run test:e2e2 --debug # run through each test in debug mode, showing the playwright Debug UI.

pnpm run test:e2e2 --grep "chat" # run all tests matching the given string
pnpm run test:e2e2 --ui # run tests using the Playwright UI
```

![Playwright UI](./img/playwright-ui.jpg)
> The Playwright UI
> 1. Easily trigger or watch tests
> 2. Scroll trough an interactive recording allowing you to see the UI or try different locators
> 3. Test steps make it easy to read and understand what is happening
> 4. Attachments such as logs, telemetry dumps, etc.

### Updating Recordings

If you see an error about Polly missing recordings it means a network request was made which has not been previously recorded. To keep tests flake-free and performant tests only make real network requests when they are explicitly in "recording" mode.

Either update the use statement for a specific test:

![Enable recording for specific test](./img/enable-recording.jpg)

Or you can set the `CODY_RECORD_IF_MISSING` or `CODY_RECORDING_MODE` environment variables.

VSCode, annoyingly, is not able to load or reload environment variables. So instead `playwright.v2.config.ts` loads an optional `vscode/.env` file. This allows you to switch environment variables on the fly without having to reload your IDE.

```sh
# vscode/.env
CODY_RECORD_IF_MISSING=true
```
  
## Overview

Before we dive into how to use the framework to actually write tests let's first orient ourselves a little bit. Starting out the foundation and moving up the stack.

![Overview](./img/overview.svg)

### 1. Playwright

The testing framework is built on [Playwright](https://playwright.dev/). Compared to Vitest, the preferred framework for unit tests, Playwright provides a more robust feature set w.r.t. UI testing. Althgouh the VSCode project provides a Playwright/Electron powered e2e testing framework we deliberately moved away from using it as it creates significant overhead and severely hinders in adhering to the core principles of this framework.

### 2. Fixture

The fixture layer implements foundational and configurable components. Because Playwright automatically handles dependencies between components simply referencing any of these components in your test will automatically load (and unload) the necessary dependencies.

Ideally you should not have to interact with these components directly too much, instead trying to capture shared logic in more high-level re-usable components in the UIX layer.

#### 2.1 Configuration

Have an extra look at the `playwright.v2.config.ts` file and note how by using the `use` semantic you can configure almost every aspect of this Fixture layer (fully typed!). Additionally the fixutre components only work with configuration that has passed a [zod](https://zod.dev/) schema check and will automatically throw an error if the configuration is invalid or missing.

Configuration is also split between worker & test configuration so that most settings can even be altered per test like this:

```ts
//change-config for test

test.describe('Test 1', () => {
    test.use({
        templateWorkspaceDir: 'workspace-1',
    })
    ...
test.describe('Test 2', () => {
  test.use({
      templateWorkspaceDir: 'workspace-2',
  })
  ...
```

#### 2.2 VSCode Server

Rather than relying on Electron for each test we instead run a headless VSCode server and then connect the normal Playwright browser to it. And despite what you might be thinking...

> 🙅‍♂️ THIS IS NOT THE SAME AS RUNNING VSCODE WEB!

VSCode Web means that the extension host (which is where Cody is executed) runs in the Browser. As such node APIs are not available in this mode.

However VSCode server runs actual **real** VSCode but then instead of showing the UI in Electron, it simply show the UI in a normal browser. This means that Cody still runs in a proper Node.js extension host and can use all the same APIs. Just with a lot less overhead and the ability to run in a headless mode 🔥.

#### 2.3 MitM Server / PollyJS

Because the Cody extension actually runs inside of VSCode we have no control over the network traffic like we do in the Agent or Unit tests.

Instead each test gets given a Man-in-the-Middle (MitM) server which listens on a set of ports for incoming traffic. This traffic is then dispatched to a configurable endpoint also merging/replacing in any authentication headers. Because this MitM server is running within the test framework you have full control over its configuration.

More importantly because network events are re-emitted from your tests we can now use PollyJS to record, manipulate and replay network traffic just as we do for the Agent and Unit tests.

#### 2.4 Workspace

The workspace your test has access to is a fully isolated clone from a configurable `tempalteWorkspaceDir`. This means that within your test you can change the workspace in any way you like!

For instance you can modify the `vscode/settings.json` to enable some feature or run a `git init` command (UIX helper available) to test something like cody-ignore.

Not all workspace state is availabe in the actual filesystem. VSCode creates a virtual user-space filesystem inside of the browser's IndexDB to store sensitive settings or extension state. Although these almost never need to be modified there are helpers available if needed. See `vscode/e2e/utils/vscody/uix/vscode/start.ts` for an example. This could for instance be a way of modifying the `AnonymousUserID` state in the Cody extension before the extension is even loaded.

Finally some "state" such as BFG binaries create considerable overhead to be downloaded for every test. Instead these are by default configured to be stored in a shared location (`../.test/global/bin`). Because Cody has been explicitly designed to use lockdirs to handle multiple parallel instances and share downloads among them, this can be done safely.

### 3. UIX (User Interaction Extensions)

The UIX layer is a way to collect common Playwright selectors and actions into more discoverable and reusable high-level functions and interfaces.

Its main goal is to provide a convenient and discoverable way to perform common actions such as signing-in, opening a file or modifying http response times.

### 4. Tests

Test files are run in parallel and even the tests within a single file are parallelized. Although you can opt-out of this behaviour by using the `test.serial` method it is strongly recommended to simply avoid any global state and keep tests as pure stateless functions.

Test are given (or rather can request) fixture components which can be used directly or passed along to higher-level UIX components to write your tests.

Tests can either be run from the CLI, Playwright UI, or directly from VSCode using the Playwright Plugin. By default tests are run headless (and don't even require a GPU). If you want to view the UI make sure to include the `--headed` or `--debug` flag.

Tests can loosely been organized into projects so that they can be run as bundles. For instance `vscode/e2e/features` contains tests of core functionality and should run as part of the CI pipeline. Whereas `vscode/e2e2/issues` might instead contain replications of Linear issues that can be merged even before they are fixed as these tests are not run as part of the CI pipeline. This should make "tests" a much more broadly applicable tool in your dev workflow.

### 5. Isolated Resources

The test uses the fixture and UIX components to instantiate and configure several resources outside of the test. We already mentioned a few in Section [2.4](#24-workspace) such as the workspace folder.

Another example is the VSCode server which is assigned a unique set of ports for the test to use. This means we can have up to 100 parallel tests running on the same machine without any port conflicts.

The only resources that aren't isolated are the hardware and the OS. This means that things like testing System Proxies are best done within a containerized/virtualized environment. Also note that if too many tests are running in parallel the hardware can become a bottleneck and cause tests to fail.

### 6. Test Artifacts

The artifacts of each test, such as workspace and VSCode server data, is stored in the `.test/runs/RUN_ID` directory. This allowes you to always look at the state of a test when it failed.

Additionally Playwright produces several artifacts in `vscode/.test-reports`. The `report.json` file is the source of truth but will automatically be converted to an interactive Trace UI view, HTML report, or Github Action / Buildkite compatible output depending on the configuration.

## Writing Great Tests

All of this framework is essentially focussed on eliminating one thing...flake. 

![Flakes You're Looking For](./img/flakes.png)

Flake is where state, timing, or other factors external to the test can influence the outcome of it. To understand how the tools in this framework can help write flake-free tests let's start with some concrete examples of flake we've encountered in the past.

#### What Causes Flake?

##### 1. **Clicks are _not_ immediate**

When you click a button in VSCode it dispatches an action which is placed in a queue. This queue is processed separately from the main thread and thus might take a few milliseconds to actually produce the desired result. More importantly the timing can vary wildly.

This causes issues where tests would timeout because we would "click" a button and then select the "first result" but the result-list would be updated a few milliseconds later. This is why you used to see lots of `sleeps` around the old e2e tests.

This was compounded by the fact that clicks had to be used for all interactions. Even those completely unrelated to the behaviour being tested. For instance opening a file would require switching to the file-explorer, scrolling the tree view, finding the element, clicking and waiting for the file to load.

##### 2. **Networks are _not_ predicatble**

Kind of obvious but network requests can vary wildly in speed or even fail altogether. 

Another problem is that sending real network requests makes tests very hard to reproduce. So if a test fails in CI it can be really hard to figure out what actually went wrong.

Finally it isn't always the slowness of the network that causes flake. For instance if you're trying to test the `cancel` button after submitting a chat message, there's a chance that the request is resolved before your test has progressed and your `click` command has been handled by VSCode. In these cases you'd need precise control over the request timings to ensure you have enought time to perform your actions.

##### 3. **State is _not_ for sharing**

We had examples of tests that would change some file and then check that the UI updated accordingly. However if this test failed the file was not restored, meaning that a subsequent test would fail because the file was not in the expected state.

Because tests were able to modify state it also made them impossible to parallelize as not only could tests interfere with each other they also required a specific order of execution.

#### What's the Solution?

Unfortunately there's not a single magic bullet that elliminates all flake. By disabling retries we at least make the problem clearly visible.

And by leveraging this framework we now at least have a toolset that we can use to address any flake issues as they occur. So let's have a look at some common scenarios and best-practices.

### Locators

Writing reliable Locators is hard. The most reliable way is by assigning a `test-id` to a DOM node and using that.

```ts
await page.locator('div.chat-view ').nth(2) ❌
await sidebar.content.getByTestId('tab-account').click() ✅
```

However that only works if there is a single unique semantic element of that "id" on the page.

For all other locators we can leverage the fact that locators can be stacked. For instance the `sidebar.content` locator above limits the scope that is searched for any subsequent locator. This is what powers the UIX components such as `Webview`

```ts
class WebView {

    public get content() {
        return this.ctx.page
          .frameLocator(`.webview[name="${this.id}"]`)
          .frameLocator('#active-frame')
    }

    // calling content.locator('div').first() would return the first div of the webview
}
```

#### Webviews

A quick note about WebViews. Within VSCode extensions has two options for rendering UI elements. Either it provides some configuration of UI components which are rendered by VSCode themselves (such as tree-view, or status-bar). Alternatively the extension can provide a custom `html/js` entrypoint which is rendered within an IFrame, called a WebView.

Locators can't pass between the top-level frame and the webview frame. If you want to select anything inside of a webview you HAVE to use the `frameLocator` to first get the root iframe of that WebView.

Finally it's a good practice to try and make you Locators always match a single element, even if the amount might vary. For instance:

```ts
page.locator('ul li').click() // ❌ this only works if the list happens to have a single element
page.locator('ul li').first().click() // ✅ even works if the list has varying amount of elements
page.locator('ul li[data-id="1"]').click() // 🤩 even works if the order is not guaranteed
```

### Clicks

Because clicks are relatively slow and unpredictable they are often the most flaky part of a test. 

One good rule of thumb is to follow every click with a expect statement that validates the click was successful. This is because `expect` statements halt execution until the assertion is met (or times out). This makes them much more reliable and performant than `sleep` statements.

```ts
await cody.statusBar.click() // 1. click
await expect(session.QuickPick.items({ hasText: 'Cody is disabled in this file' })).toBeVisible() // 2. assert success with an expect
await cody.statusBar.filter({hasText: 'Cody is disabled'}).click() // 3. Clicks can themselves also serve as an assertion.
```

When a test fails you can always look at the trace recording to get a visualization of where the locator was pointing.

It is also best to reseve clicks when part of the actual behaviour being tested. For instance, don't use clicks to open a file or prepare other test conditions. We have much more powerfull and flake-free alternatives to do so...

#### Commands > Clicks

Instead of using clicks you can simply dispatch VSCode commands. This has the added benefit that is automatically follwed by a "process" step for VSCode to process the queue of pending commands.

For example, opening Cody:
```ts
/**
 * ❌ previously we would find the sidebar 
 * and click the Cody button
 */

// In case the cody sidebar isn't focused, select it.
while (!(await isSidebarVisible(page))) {
    await page.click('[aria-label="Cody"]')
}

/**
 *  ❌ or use a UI based
 * "invoke command"
 */
await page.keyboard.press('F1')
await expect(page.getByPlaceholder('Type the name of a command to run.')).toBeVisible({
    timeout: 1000,
})
await page.getByPlaceholder('Type the name of a command to run.').fill(`>${commandName}`)
await page.keyboard.press('Enter')

/**
 * ✅ now we can dispatch commands
 * without any UI interaction 🤯
 */
await vscodeSession.runCommand('workbench.action.closeAllEditors')
```

To find out what command to run you can easily run `> Preferences: Open Keyboard Shortcuts` and then right click on any of the commands to copy the command ID.

![Find Command ID](./img/commands.png)

#### Macros > Commands

Not all behaviour has a command though. For instance, even something as simplle as opening a file does not have a command available in VSCode. This can only be done through the VSCode API and this is exactly what the `macro` allows you to do.

For instance this is how `runMacro` is used in the UIX VSCode Editor helper to provide a `OpenFile` and `Select` utilities.

```ts
async openFile(args: OpenFileArgs) {
  // by making it a step it shows up in the trace as a single command
  return t.step('Editor.openFile', async () => { 
      const file = await this.session.runMacro(
          // Just some identifier for the macro to show in the trace view
          'uix:openFile',
          // IMPORTANT: This is explicitly not a arrow function. 
          // This way the framework provides a `this` context to 
          // give type-safe access to the VSCode API and other utilities.
          async function (args) {
              const { file = `\${workspaceFolder}/${args.workspaceFile}`, viewColumn } = args
              // this.vscode ... the full power of the VSCode API
              const uri = this.vscode.Uri.file(this.utils.substitutePathVars(file))
              const showOptions = { preserveFocus: true, preview: false, viewColumn }
              await this.vscode.commands.executeCommand('vscode.open', uri, showOptions)
              // values can be returned, as long as they are serializable
              return uri
          },
          [args] // arguments are serialized and passed to the macro
      )
      // It comes back JSON serialized, so we need to parse it
      const uri = URI.from(file)
      ...
}

async select(args: SelectArgs) {
        return await this.session.runMacro(
            'uix:select',
            async function (args) {
                const editor = this.vscode.window.activeTextEditor
                if (!editor) {
                    throw new Error('No editor is active')
                }
                ...
                editor.selections = [new this.vscode.Selection(fromPosition, toPosition)]
                editor.revealRange(
                    editor.selection,
                    this.vscode.TextEditorRevealType.InCenterIfOutsideViewport
                )
            },
            [args]
        )
    }
}
```

This works because of a special "Testing Extension" which is loaded by the fixture. This extension provides a `eval` command that takes an arbitrary Javascript string as input and executes it. The rest is just some typing magic. You can find more details in `vscode/e2e/utils/vscody/extension/main.js`

### Setup

#### Authentication

#### Workspace

### Network

#### Recordings

#### Mocking

### Telemetry

#### Snapshots


## Next Steps

- Full local-only end-to-end tests including locally runing backend instances. This would allow us to more easily develop and verify fullstack changes.
- Install extension from built `.visx` file to ensure production builts are test.
- A way to manipulate time in the extension. This would allow us to "fast forward" 15 seconds to check that some telemetry event has fired etc.
- "Migrate" and expand Authentication tests. This components feels like a prime candidate for thorough testing of core functionality and all edge-cases such as network issues, timeouts, misconfigurations, etc.
