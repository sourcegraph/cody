import * as child_process from 'child_process'
import { promises as fs, mkdir, mkdtempSync, rmSync, writeFile } from 'fs'
import * as os from 'os'
import * as path from 'path'

import { test as base, expect, type Frame, type FrameLocator, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import * as uuid from 'uuid'

import { resetLoggedEvents, run, sendTestInfo } from '../fixtures/mock-server'

import { installVsCode } from './install-deps'

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

export const test = base
    // By default, use ../../test/fixtures/workspace as the workspace.
    .extend<WorkspaceDirectory>({
        // Playwright needs empty pattern to specify "no dependencies".
        // eslint-disable-next-line no-empty-pattern
        workspaceDirectory: async ({}, use) => {
            const vscodeRoot = path.resolve(__dirname, '..', '..')
            const workspaceDirectory = path.join(vscodeRoot, 'test', 'fixtures', 'workspace')
            await use(workspaceDirectory)
        },
    })
    // By default, do not add any extra workspace settings.
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            'cody.experimental.symfContext': false,
        },
    })
    // By default, treat https://sourcegraph.com as "dotcom".
    .extend<DotcomUrlOverride>({
        dotcomUrl: undefined,
    })
    .extend<{}>({
        page: async ({ page: _page, workspaceDirectory, extraWorkspaceSettings, dotcomUrl }, use, testInfo) => {
            void _page

            const vscodeRoot = path.resolve(__dirname, '..', '..')

            const vscodeExecutablePath = await installVsCode()
            const extensionDevelopmentPath = vscodeRoot

            const userDataDirectory = mkdtempSync(path.join(os.tmpdir(), 'cody-vsce'))
            const extensionsDirectory = mkdtempSync(path.join(os.tmpdir(), 'cody-vsce'))
            const videoDirectory = path.join(vscodeRoot, '..', 'playwright', escapeToPath(testInfo.title))

            await buildWorkSpaceSettings(workspaceDirectory, extraWorkspaceSettings)

            sendTestInfo(testInfo.title, testInfo.testId, uuid.v4())

            let dotcomUrlOverride: { [key: string]: string } = {}
            if (dotcomUrl) {
                dotcomUrlOverride = { TESTING_DOTCOM_URL: dotcomUrl }
            }

            // See: https://github.com/microsoft/vscode-test/blob/main/lib/runTest.ts
            const app = await electron.launch({
                executablePath: vscodeExecutablePath,
                env: {
                    ...process.env,
                    ...dotcomUrlOverride,
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
                    '--extensionDevelopmentPath=' + extensionDevelopmentPath,
                    `--user-data-dir=${userDataDirectory}`,
                    `--extensions-dir=${extensionsDirectory}`,
                    workspaceDirectory,
                ],
                recordVideo: {
                    dir: videoDirectory,
                },
            })

            await waitUntil(() => app.windows().length > 0)

            const page = await app.firstWindow()

            // Bring the cody sidebar to the foreground
            await page.click('[aria-label="Cody"]')
            // Ensure that we remove the hover from the activity icon
            await page.getByRole('heading', { name: 'Cody: Chat' }).hover()
            // Wait for Cody to become activated
            // TODO(philipp-spiess): Figure out which playwright matcher we can use that works for
            // the signed-in and signed-out cases
            await new Promise(resolve => setTimeout(resolve, 500))

            await run(async () => {
                // Ensure we're signed out.
                if (await page.isVisible('[aria-label="User Settings"]')) {
                    await signOut(page)
                }

                resetLoggedEvents()
                await use(page)
            })

            await app.close()

            // Delete the recorded video if the test passes
            if (testInfo.status === 'passed') {
                rmSync(videoDirectory, { recursive: true })
            }

            rmSync(userDataDirectory, { recursive: true })
            rmSync(extensionsDirectory, { recursive: true })
        },
    })
    .extend<{ sidebar: Frame }>({
        sidebar: async ({ page }, use) => {
            const sidebar = await getCodySidebar(page)
            await use(sidebar)
        },
    })

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
async function buildWorkSpaceSettings(workspaceDirectory: string, extraSettings: WorkspaceSettings): Promise<void> {
    const settings = {
        'cody.serverEndpoint': 'http://localhost:49300',
        'cody.commandCodeLenses': true,
        'cody.editorTitleCommandIcon': true,
        ...extraSettings,
    }
    // create a temporary directory with settings.json and add to the workspaceDirectory
    const workspaceSettingsPath = path.join(workspaceDirectory, '.vscode', 'settings.json')
    const workspaceSettingsDirectory = path.join(workspaceDirectory, '.vscode')
    await new Promise((resolve, reject) => {
        mkdir(workspaceSettingsDirectory, { recursive: true }, err => (err ? reject(err) : resolve(undefined)))
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
    await page.keyboard.press('F1')
    await page.getByRole('combobox', { name: 'input' }).fill('>cody sign out')
    await page.keyboard.press('Enter')
}

/**
 * Verifies that loggedEvents contain all of expectedEvents (in any order).
 */
export async function assertEvents(loggedEvents: string[], expectedEvents: string[]): Promise<void> {
    await expect.poll(() => loggedEvents).toEqual(expect.arrayContaining(expectedEvents))
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
    // Open a file from the file picker
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('P')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    await page.keyboard.type(`${filename}\n`)
}

// Starts a new panel chat and returns a FrameLocator for the chat.
export async function newChat(page: Page): Promise<FrameLocator> {
    await page.getByRole('button', { name: 'New Chat' }).click()
    return page.frameLocator('iframe.webview').last().frameLocator('iframe')
}
