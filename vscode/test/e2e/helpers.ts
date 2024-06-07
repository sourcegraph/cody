import * as child_process from 'node:child_process'
import {
    promises as fs,
    type PathLike,
    type RmOptions,
    mkdir,
    mkdtempSync,
    rmSync,
    writeFile,
} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
    type ElectronApplication,
    type Frame,
    type Page,
    type TestInfo,
    test as base,
    expect,
} from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as uuid from 'uuid'

import {
    MockServer,
    SERVER_URL,
    VALID_TOKEN,
    loggedEvents,
    loggedV2Events,
    resetLoggedEvents,
    sendTestInfo,
} from '../fixtures/mock-server'

import type { RepoListResponse } from '@sourcegraph/cody-shared'
import { expectAuthenticated, focusSidebar } from './common'
import { installVsCode } from './install-deps'
import { buildCustomCommandConfigFile } from './utils/buildCustomCommands'
// Playwright test extension: The workspace directory to run the test in.
export interface WorkspaceDirectory {
    workspaceDirectory: string
}

interface WorkspaceSettings {
    [key: string]: string | boolean | number
}

// Playwright test extension: Extra VSCode settings to write to
// .vscode/settings.json.
export interface ExtraWorkspaceSettings {
    extraWorkspaceSettings: WorkspaceSettings
}

// Playwright test extension: Treat this URL as if it is "dotcom".
export interface DotcomUrlOverride {
    dotcomUrl: string | undefined
}

export interface TestConfiguration {
    preAuthenticate?: boolean
}

// playwright test extension: Add expectedEvents to each test to compare against
export interface ExpectedEvents {
    expectedEvents: string[]
}

// playwright test extension: Add expectedV2Events to each test to compare against
export interface ExpectedV2Events {
    expectedV2Events: string[]
}

export interface TestDirectories {
    assetsDirectory: string
    userDataDirectory: string
    extensionsDirectory: string
}

const vscodeRoot = path.resolve(__dirname, '..', '..')

export const getAssetsDir = (testName: string): string =>
    path.join(vscodeRoot, '..', 'playwright', escapeToPath(testName))

export const getTempVideoDir = (testName: string): string =>
    path.join(getAssetsDir(testName), 'temp-videos')

export const test = base
    // By default, use ../../test/fixtures/workspace as the workspace.
    .extend<WorkspaceDirectory>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
        workspaceDirectory: async ({}, use) => {
            const workspaceDirectory = path.join(vscodeRoot, 'test', 'fixtures', 'workspace')
            await use(workspaceDirectory)
        },
    })
    // By default, do not add any extra workspace settings.
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            'cody.experimental.symfContext': false,
            // NOTE: Enable unstable features for testing.
            'cody.internal.unstable': true,
        },
    })
    // By default, treat https://sourcegraph.com as "dotcom".
    .extend<DotcomUrlOverride>({
        dotcomUrl: undefined,
    })
    .extend<TestConfiguration>({
        preAuthenticate: false,
    })
    // By default, these events should always fire for each test
    .extend<ExpectedEvents>({
        expectedEvents: async ({ preAuthenticate }, use) =>
            await use(
                preAuthenticate
                    ? ['CodyInstalled']
                    : [
                          'CodyInstalled',
                          'CodyVSCodeExtension:auth:clickOtherSignInOptions',
                          'CodyVSCodeExtension:login:clicked',
                          'CodyVSCodeExtension:auth:selectSigninMenu',
                          'CodyVSCodeExtension:auth:fromToken',
                          'CodyVSCodeExtension:Auth:connected',
                      ]
            ),
    })

    .extend<ExpectedV2Events>({
        expectedV2Events: async ({ preAuthenticate }, use) =>
            await use(
                preAuthenticate
                    ? [
                          // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
                          // 'cody.extention.installed'
                          'cody.auth:connected',
                      ]
                    : [
                          // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
                          // 'cody.extention.installed',
                          'cody.auth:connected',
                      ]
            ),
    })
    .extend<TestDirectories>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright ascribes meaning to the empty pattern: No dependencies.
        assetsDirectory: async ({}, use, testInfo) => {
            await use(getAssetsDir(testInfo.title))
        },
        // biome-ignore lint/correctness/noEmptyPattern: Playwright ascribes meaning to the empty pattern: No dependencies.
        userDataDirectory: async ({}, use) => {
            await use(mkdtempSync(path.join(os.tmpdir(), 'cody-vsce')))
        },
        // biome-ignore lint/correctness/noEmptyPattern: Playwright ascribes meaning to the empty pattern: No dependencies.
        extensionsDirectory: async ({}, use) => {
            await use(mkdtempSync(path.join(os.tmpdir(), 'cody-vsce')))
        },
    })
    .extend<{ server: MockServer }>({
        server: [
            // biome-ignore lint/correctness/noEmptyPattern: Playwright ascribes meaning to the empty pattern: No dependencies.
            async ({}, use) => {
                MockServer.run(async server => {
                    await use(server)
                })
            },
            { auto: true },
        ],
    })
    .extend<{ app: ElectronApplication }>({
        // starts a new instance of vscode with the given workspace settings
        app: async (
            {
                workspaceDirectory,
                extraWorkspaceSettings,
                dotcomUrl,
                preAuthenticate,
                userDataDirectory,
                extensionsDirectory,
            },
            use,
            testInfo
        ) => {
            const vscodeExecutablePath = await installVsCode()
            const extensionDevelopmentPath = vscodeRoot

            await buildWorkSpaceSettings(workspaceDirectory, extraWorkspaceSettings)
            await buildCustomCommandConfigFile(workspaceDirectory)

            let dotcomUrlOverride: { [key: string]: string } = {}
            if (dotcomUrl) {
                dotcomUrlOverride = { TESTING_DOTCOM_URL: dotcomUrl }
            }

            //pre authenticated can ensure that a token is already set in the secret storage
            let secretStorageState: { [key: string]: string } = {}
            if (preAuthenticate) {
                secretStorageState = {
                    TESTING_SECRET_STORAGE_TOKEN: JSON.stringify([SERVER_URL, VALID_TOKEN]),
                }
            }
            // See: https://github.com/microsoft/vscode-test/blob/main/lib/runTest.ts
            const app = await electron.launch({
                executablePath: vscodeExecutablePath,
                env: {
                    ...process.env,
                    ...dotcomUrlOverride,
                    ...secretStorageState,
                    CODY_TESTING: 'true',
                },
                args: [
                    // https://github.com/microsoft/vscode/issues/84238
                    '--no-sandbox',
                    // https://github.com/microsoft/vscode-test/issues/120
                    '--disable-updates',
                    '--skip-welcome',
                    '--skip-release-notes',
                    '--disable-workspace-trust',
                    `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
                    `--user-data-dir=${userDataDirectory}`,
                    `--extensions-dir=${extensionsDirectory}`,
                    workspaceDirectory,
                ],
                recordVideo: {
                    // All running tests will be recorded to a temp video file.
                    // successful runs will be deleted, failures will be kept
                    dir: getTempVideoDir(testInfo.title),
                },
            })

            await waitUntil(() => app.windows().length > 0)

            await use(app)

            await app.close()

            await rmSyncWithRetries(userDataDirectory, { recursive: true })
            await rmSyncWithRetries(extensionsDirectory, { recursive: true })
        },
    })
    .extend<{ openDevTools: () => Promise<void> }>({
        // utility which can be called in a test to open developer tools in the
        // vscode under test. They can't be opened manually so this can be called
        // from a test before a page.pause() to inspect the page.
        openDevTools: async ({ app }, use) => {
            await use(async () => {
                const window = await app.browserWindow(await app.firstWindow())
                await window.evaluate(async app => {
                    app.setFullScreen(true)
                    await app.webContents.openDevTools()
                })
            })
        },
    })
    .extend({
        page: async (
            {
                page: _page,
                app,
                openDevTools,
                assetsDirectory,
                expectedEvents,
                expectedV2Events,
                preAuthenticate,
            },
            use,
            testInfo
        ) => {
            sendTestInfo(testInfo.title, testInfo.testId, uuid.v4())

            if (process.env.DEBUG) {
                await openDevTools()
            }
            const page = await app.firstWindow()

            // Bring the cody sidebar to the foreground if not already visible
            await focusSidebar(page)
            // Ensure that we remove the hover from the activity icon
            await page.getByRole('heading', { name: 'Cody: Chat' }).hover()
            // Wait for Cody to become activated
            // TODO(philipp-spiess): Figure out which playwright matcher we can use that works for
            // the signed-in and signed-out cases
            await new Promise(resolve => setTimeout(resolve, 500))
            if (preAuthenticate) {
                await expectAuthenticated(page)
            } else if (await page.isVisible('[aria-label="User Settings"]')) {
                // Ensure we're signed out.
                await signOut(page)
            }
            await use(page)

            // Only run event logging assertions if the test passed. If it failed, it probably
            // wouldn't have triggered all the right event logging calls anyway.
            if (testInfo.status === 'passed') {
                // Critical test to prevent event logging regressions.
                // Do not remove without consulting data analytics team.
                try {
                    await assertEvents(loggedEvents, expectedEvents)
                } catch (error) {
                    console.error('Expected events do not match actual events!')
                    console.log('Expected:', expectedEvents)
                    console.log('Logged:', loggedEvents)
                    throw error
                }
                try {
                    await assertEvents(loggedV2Events, expectedV2Events)
                } catch (error) {
                    console.error('Expected v2 events do not match actual events!')
                    console.log('Expected:', expectedV2Events)
                    console.log('Logged:', loggedV2Events)
                    throw error
                }
            } else {
                await attachArtifacts(testInfo, page, assetsDirectory)
            }

            resetLoggedEvents()
        },
    })
    .extend<{ sidebar: Frame | null; getCodySidebar: () => Promise<Frame> }>({
        sidebar: async ({ page, preAuthenticate }, use) => {
            if (preAuthenticate) {
                await use(null)
            } else {
                const sidebar = await getCodySidebar(page)
                await use(sidebar)
            }
        },
        getCodySidebar: async ({ page }, use) => {
            await use(() => getCodySidebar(page))
        },
    })
    // Simple sleep utility with a default of 300ms
    .extend<{ nap: (len?: number) => Promise<void> }>({
        nap: async ({ page }, use) => {
            await use(async (len?: number) => {
                await page.waitForTimeout(len || 300)
            })
        },
    })

// Attaches a screenshot and the video of the test run to the test
const attachArtifacts = async (
    testInfo: TestInfo,
    page: Page,
    assetsDirectory: string
): Promise<void> => {
    const testSlug = `run_${testInfo.repeatEachIndex}_retry_${testInfo.retry}_failure`
    // Take a screenshot before closing the app if we failed
    const screenshot = await page.screenshot({
        path: path.join(assetsDirectory, 'screenshots', `${testSlug}.png`),
    })
    await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' })
    // Copy the file from the temporary video directory to the assets directory
    // to the assets directory so it is not deleted
    const [video] = await fs.readdir(getTempVideoDir(testInfo.title))
    const oldVideoPath = path.join(getTempVideoDir(testInfo.title), video)
    const newVideoPath = path.join(assetsDirectory, 'videos', `${testSlug}.webm`)
    await fs.mkdir(path.join(assetsDirectory, 'videos'), { recursive: true })
    await fs.rename(oldVideoPath, newVideoPath)
    await testInfo.attach('video', { path: newVideoPath, contentType: 'video/webm' })
}

/**
 * Calls rmSync(path, options) and retries a few times if it fails before throwing.
 *
 * This reduces the chance of errors caused by timing of other processes that may have files locked, such as
 *
 *    Error: EBUSY: resource busy or locked,
 *      unlink '\\?\C:\Users\RUNNER~1\AppData\Local\Temp\cody-vsced30WGT\Crashpad\metadata'
 */
export async function rmSyncWithRetries(path: PathLike, options?: RmOptions): Promise<void> {
    const maxAttempts = 5
    let attempts = maxAttempts
    while (attempts-- >= 0) {
        try {
            rmSync(path, options)
            break
        } catch (error) {
            if (attempts === 1) {
                throw new Error(`Failed to rmSync ${path} after ${maxAttempts} attempts: ${error}`)
            }

            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }
}

async function getCodySidebar(page: Page): Promise<Frame> {
    async function findCodySidebarFrame(): Promise<null | Frame> {
        for (const frame of page.frames()) {
            try {
                const title = await frame.title()
                if (title === 'Cody') {
                    return frame
                }
            } catch (error: any) {
                // Skip over frames that were detached in the meantime.
                if (error.message.indexOf('Frame was detached') === -1) {
                    throw error
                }
            }
        }
        return null
    }
    await waitUntil(async () => (await findCodySidebarFrame()) !== null)
    return (await findCodySidebarFrame()) || page.mainFrame()
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
    let delay = 10
    while (!(await predicate())) {
        await new Promise(resolve => setTimeout(resolve, delay))
        delay <<= 1
    }
}

function escapeToPath(text: string): string {
    return text.replaceAll(/\W/g, '_')
}

// Build a workspace settings file that enables the experimental inline mode
async function buildWorkSpaceSettings(
    workspaceDirectory: string,
    extraSettings: WorkspaceSettings
): Promise<void> {
    const settings = {
        'cody.serverEndpoint': 'http://localhost:49300',
        'cody.commandCodeLenses': true,
        ...extraSettings,
    }
    // create a temporary directory with settings.json and add to the workspaceDirectory
    const workspaceSettingsPath = path.join(workspaceDirectory, '.vscode', 'settings.json')
    const workspaceSettingsDirectory = path.join(workspaceDirectory, '.vscode')
    await new Promise((resolve, reject) => {
        mkdir(workspaceSettingsDirectory, { recursive: true }, err =>
            err ? reject(err) : resolve(undefined)
        )
    })
    await new Promise<void>((resolve, reject) => {
        writeFile(workspaceSettingsPath, JSON.stringify(settings), error => {
            if (error) {
                reject(error)
            } else {
                resolve()
            }
        })
    })
}

export async function signOut(page: Page): Promise<void> {
    // TODO(sqs): could simplify this further with a cody.auth.signoutAll command
    await executeCommandInPalette(page, 'cody sign out')
}

export async function executeCommandInPalette(page: Page, commandName: string): Promise<void> {
    // TODO(sqs): could simplify this further with a cody.auth.signoutAll command
    await page.keyboard.press('F1')
    await page.getByPlaceholder('Type the name of a command to run.').fill(`>${commandName}`)
    await page.keyboard.press('Enter')
}

/**
 * Verifies that loggedEvents contain all of expectedEvents (in any order).
 */
export async function assertEvents(loggedEvents: string[], expectedEvents: string[]): Promise<void> {
    await expect
        .poll(() => loggedEvents, { timeout: 3000 })
        .toEqual(expect.arrayContaining(expectedEvents))
}

// Creates a temporary directory, calls `f`, and then deletes the temporary
// directory when done.
export async function withTempDir<T>(f: (dir: string) => Promise<T>): Promise<T> {
    // Create the temporary directory
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cody-vsce'))
    try {
        return await f(dir)
    } finally {
        // Remove the temporary directory
        await fs.rm(dir, { recursive: true, force: true })
    }
}

// Runs a program (see `child_process.spawn`) and waits until it exits. Throws
// if the child exits with a non-zero exit code or signal.
export function spawn(...args: Parameters<typeof child_process.spawn>): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(...args)
        child.once('close', (code, signal) => {
            if (code || signal) {
                reject(new Error(`child exited with code ${code}/signal ${signal}`))
            } else {
                resolve()
            }
        })
    })
}

// Uses VSCode command palette to open a file by typing its name.
export async function openFile(page: Page, filename: string): Promise<void> {
    const metaKey = getMetaKeyByOS()
    // Open a file from the file picker
    await page.keyboard.press(`${metaKey}+P`)
    // Makes sure the file picker input box has the focus
    await page.getByPlaceholder(/Search files by name/).click()
    await page.keyboard.type(`${filename}`)
    // Makes sure the file is visible in the file picker
    await expect(page.locator('a').filter({ hasText: filename })).toBeVisible()
    await page.keyboard.press('Enter')
    // Makes sure the file is opened in the editor
    await expect(page.getByRole('tab', { name: filename })).toBeVisible()
}

export function withPlatformSlashes(input: string) {
    return input.replaceAll(path.posix.sep, path.sep)
}

const isPlatform = (platform: string) => process.platform === platform
export function getMetaKeyByOS(): 'Meta' | 'Control' {
    return isPlatform('darwin') ? 'Meta' : 'Control'
}

export const openCustomCommandMenu = async (page: Page): Promise<void> => {
    const customCommandSidebarItem = page
        .getByRole('treeitem', { name: 'Custom Commands' })
        .locator('a')
        // The second item is the setting icon attached to the "Custom Commands" item.
        .first()
    await customCommandSidebarItem.click()
}

export const testWithGitRemote = test.extend<WorkspaceDirectory>({
    // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
    workspaceDirectory: async ({}, use) => {
        await withTempDir(async tempDir => {
            const dir = path.join(tempDir, 'myrepo')
            await fs.mkdir(dir)

            // Initialize a git repository there
            await spawn('git', ['init'], { cwd: dir })
            await spawn('git', ['config', 'user.name', 'Test User'], {
                cwd: dir,
            })
            await spawn('git', ['config', 'user.email', 'test@example.host'], { cwd: dir })

            // Commit some content to the git repository.
            await Promise.all([
                fs.writeFile(path.join(dir, 'README.md'), 'Prints a classic greeting'),
                fs.writeFile(
                    path.join(dir, 'main.c'),
                    '#include <stdio.h>\n\nmain() {\n\tprintf("Hello, world.\\n");\n}\n'
                ),
            ])
            await spawn('git', ['add', 'README.md', 'main.c'], { cwd: dir })
            await spawn('git', ['commit', '-m', 'Initial commit'], {
                cwd: dir,
            })

            // Add a remote to the git repo.
            await spawn('git', ['remote', 'add', 'origin', 'git@host.example:user/myrepo.git'], {
                cwd: dir,
            })

            await use(dir)
        })
    },
})

export function mockEnterpriseRepoMapping(server: MockServer, repoName: string): void {
    server.onGraphQl('Repositories').replyJson({
        data: {
            repositories: {
                nodes: [
                    {
                        id: 'WOOZL',
                        name: repoName,
                    },
                ],
                pageInfo: {
                    endCursor: 'WOOZL',
                },
            },
        } satisfies RepoListResponse,
    })
    server.onGraphQl('ResolveRepoName').replyJson({ data: { repository: { name: repoName } } })
}
