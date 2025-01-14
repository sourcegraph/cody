import { expect } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'
import { CodyAutoSuggestionMode } from '@sourcegraph/cody-shared'
import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExtraWorkspaceSettings,
    test as baseTest,
    executeCommandInPalette,
} from './helpers'

/**
 * Auto-Edit Visual Regression Tests
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
 * testing of auto-edit functionality.
 * [Slack discussion](https://sourcegraph.slack.com/archives/C07F8LLKE06/p1734715196312609)
 * [Integration PR](https://github.com/sourcegraph/cody/pull/6454)
 *
 * Implementation Note: Mock Response Strategy
 *
 * While typically E2E tests use mock-server.ts for server responses, auto-edit tests
 * use direct mock responses instead, for the following reasons:
 *
 * 1. Flexibility & Extensibility:
 *    - Mock server requires maintaining a hardcoded list of responses checked against prompts
 *    - Adding new test cases (e.g. 10-12 different image types from cody-chat-eval)
 *      would be cumbersome with mock-server
 *
 * 2. Response Generation:
 *    - Server responses require rewriting code snippets
 *    - Would need to either manually extract logic or use mock-renderer setup
 *    - Current approach allows direct porting of examples from cody-chat-eval
 *
 * 3. Test Coverage:
 *    - Adapters are already covered by extensive unit tests
 *    - E2E tests focus on visual regression testing of the feature
 *    - Skipping adapter layer in E2E is acceptable given the coverage elsewhere
 *
 * While this approach bypasses the adapter layer in E2E setup, it provides better
 * flexibility for testing visual aspects of auto-edit functionality.
 */

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            'cody.suggestions.mode': CodyAutoSuggestionMode.Autoedit,
            'cody.experimental.autoedit.use-mock-responses': true,
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
    /* The line in which the autoedit should be triggered */
    line: number
    /* The column in which the autoedit should be triggered. Defaults to the end of the line */
    column?: number
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

    // Fix the viewport size
    // Note: Use a suitable viewport size that ensures that decorations are visible in the screenshot
    await page.setViewportSize({
        width: 1920,
        height: 1080,
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

    // Go to the auto-edit directory in the workspace
    await page.getByRole('treeitem', { name: 'auto-edit' }).locator('a').click()
    await page.getByRole('treeitem', { name: fileName }).locator('a').click()

    // Close the explorer view
    // We don't need it when executing in zen mode, keeping the logic commented for now in case need it later.
    // await page.waitForTimeout(500)
    // await sidebarExplorer(page).click()

    // Activate the zen mode to remove diffs from any other elements
    await executeCommandInPalette(page, 'View: Toggle Zen Mode')
    await executeCommandInPalette(page, 'Hide Custom Title Bar In Full Screen')

    for (const { line, column = Number.MAX_SAFE_INTEGER, clip } of lineOptions) {
        const snapshotName = `${testCaseName}-${line}.png`
        await executeCommandInPalette(page, 'Go to Line/Column')
        await page.keyboard.type(`${line}:${column}`)
        await page.keyboard.press('Enter')

        await executeCommandInPalette(page, 'Cody: Autoedits Manual Trigger')

        // Wait for the diff view to stabilize - required to reduce flakiness
        await page.waitForTimeout(500)

        await expect(page).toHaveScreenshot([snapshotPlatform, snapshotName], {
            // Note: This values allow some a small amount of variation in the diff view
            // Be mindful of this when adding new tests that have minor differences
            maxDiffPixelRatio: 0.02,
            maxDiffPixels: 500,
            // Threshold accounts for color changes between screenshots. It's important to keep this low as
            // our decoration logic heavily relies on pure color changes to be functional
            threshold: 0.01,
            clip,
        })
    }
}
test('autoedits: triggers a multi-line diff view when edit affects existing lines', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 70 }, { line: 76 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'suffix-decoration-example-1.py',
        testCaseName: 'autoedits-suffix-decoration',
        lineOptions,
    })
})

test('autoedits: triggers an inline completion when edit is an insertion immediately after the cursor', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 29 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'inline-completion-example-1.js',
        testCaseName: 'autoedits-inline-completion',
        lineOptions,
    })
})

test('autoedits: triggers an inline decoration when an inline completion is desired, but the insertion position is before the cursor position', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 30 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'inline-completion-example-1.js',
        testCaseName: 'autoedits-inline-decoration-insertion',
        lineOptions,
    })
})

test('autoedits: triggers inline decorations when multiple insertions are required on different lines', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 44 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'inline-decoration-example-1.rs',
        testCaseName: 'autoedits-inline-decoration-multiple-insertions-different-lines',
        lineOptions,
    })
})

test('autoedits: triggers inline decorations when multiple separate insertions are required on the same line', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 78 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'inline-decoration-example-2.ts',
        testCaseName: 'autoedits-inline-decoration-multiple-insertions-same-line',
        lineOptions,
    })
})

test('autoedits: does not show any suggestion if the suffix decoration spans further than the end of the file', async ({
    page,
    sidebar,
}) => {
    const lineOptions: LineOptions[] = [{ line: 38 }]
    await autoeditsTestHelper({
        page,
        sidebar,
        fileName: 'suffix-decoration-example-2.go',
        testCaseName: 'autoedits-suffix-decoration-end-of-file',
        lineOptions,
    })
})
