import { expect } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExtraWorkspaceSettings,
    test as baseTest,
    executeCommandInPalette,
} from './helpers'

/**
 * Auto-edits Visual Regression Tests
 *
 * Currently these tests run only on macOS due to cross-platform rendering inconsistencies.
 *
 * Previous attempts and challenges encountered:
 * 1. Platform-specific rendering differences:
 *    - Despite fixing viewport size, font settings, and pixel ratio, minor scaling
 *      differences persist across platforms
 *    - These differences affect snapshot comparisons even with identical content
 *
 * 2. Attempted solutions that didn't fully resolve the issues:
 *    - Enabled zen mode to remove UI elements
 *    - Hidden taskbars and other VS Code interface elements
 *    - Standardized font settings (family, size, line height)
 *    - Fixed device pixel ratio
 *    - Attempted viewport size normalization
 *
 * Future improvements needed for cross-platform support:
 * - Investigate platform-specific rendering engines' differences
 * - Consider platform-specific snapshot baselines
 * - Explore more robust comparison strategies that handle minor rendering variations
 *
 * Note: While macOS E2E tests are not required by default in CI, these tests
 * are currently running only on macOS to establish a baseline for visual regression
 * testing of auto-edits functionality.
 * [Slack discussion](https://sourcegraph.slack.com/archives/C07F8LLKE06/p1734715196312609)
 * [Integration PR](https://github.com/sourcegraph/cody/pull/6454)
 */

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            'cody.experimental.autoedits.enabled': true,
            'cody.experimental.autoedits.use-mock-responses': true,
        },
    })

if (process.platform !== 'darwin') {
    test.skip()
}

interface clipArgs {
    x: number
    y: number
    width: number
    height: number
}

interface LineOptions {
    lineNumber: number
    clip?: clipArgs
}

interface AutoeditsTestOptions {
    page: Page
    sidebar: Frame | null
    fileName: string
    testCaseName: string
    lineOptions: LineOptions[]
}

const autoeditsTestHelper = async ({
    page,
    sidebar,
    fileName,
    testCaseName,
    lineOptions,
}: AutoeditsTestOptions): Promise<void> => {
    const platform = process.platform
    const snapshotPlatform = platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : 'windows'

    // Use a large number to go the end of the line
    const maxColumnNumber = Number.MAX_SAFE_INTEGER

    // Fix the viewport size
    await page.setViewportSize({
        width: 1024,
        height: 741,
    })

    await page.evaluate(() => {
        document.body.style.fontFamily = 'monospace'
        document.body.style.fontSize = '14px'
        document.body.style.lineHeight = '1.5'
        window.devicePixelRatio = 1
    })

    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Go to the auto-edits directory in the workspace
    await page.getByRole('treeitem', { name: 'auto-edits' }).locator('a').click()
    await page.getByRole('treeitem', { name: fileName }).locator('a').click()

    // Close the explorer view
    // We don't need it when executing in zen mode, keeping the logic commented for now in case need it later.
    // await page.waitForTimeout(500)
    // await sidebarExplorer(page).click()

    // Activate the zen mode to remove diffs from any other elements
    await executeCommandInPalette(page, 'View: Toggle Zen Mode')
    await executeCommandInPalette(page, 'Hide Custom Title Bar In Full Screen')

    for (const { lineNumber, clip } of lineOptions) {
        const snapshotName = `${testCaseName}-${lineNumber}.png`
        await executeCommandInPalette(page, 'Go to Line/Column')
        await page.keyboard.type(`${lineNumber}:${maxColumnNumber}`)
        await page.keyboard.press('Enter')

        // Get the active text editor element and click at current position
        // This helps make sure that no other element has the focus and snapshot diff is not affected by other elements
        await page.waitForSelector('.monaco-editor.focused')
        const editor = await page.locator('.monaco-editor.focused')
        const editorBounds = await editor.boundingBox()
        if (editorBounds) {
            // Click in the middle of the current line
            await page.mouse.click(
                editorBounds.x + editorBounds.width / 2,
                editorBounds.y +
                    lineNumber *
                        Number.parseInt(
                            await page.evaluate(() => getComputedStyle(document.body).lineHeight)
                        )
            )
        }

        await executeCommandInPalette(page, 'Cody: Autoedits Manual Trigger')

        // Wait for the diff view to stabilize - required to reduce flakiness
        await page.waitForTimeout(500)

        await expect(page).toHaveScreenshot([snapshotPlatform, snapshotName], {
            maxDiffPixelRatio: 0.02,
            maxDiffPixels: 1000,
            clip,
        })
    }
}

test('autoedits-multi-line-diff-view', async ({ page, sidebar }) => {
    const lineOptions: LineOptions[] = [
        {
            lineNumber: 70,
        },
        {
            lineNumber: 76,
        },
    ]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'diff-view-example-1.py',
        testCaseName: 'autoedits-multi-line-diff-view',
        lineOptions,
    })
})
