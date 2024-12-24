import { expect } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExtraWorkspaceSettings,
    test as baseTest,
    // test,
    executeCommandInPalette,
} from './helpers'

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            'cody.experimental.autoedits.enabled': true,
            'cody.experimental.autoedits.use-mock-responses': true,
        },
    })

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
    // const platform = process.platform
    // const snapshotPlatform = platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : 'windows'

    // Use a large number to go the end of the line
    const maxColumnNumber = Number.MAX_SAFE_INTEGER

    // Fix the viewport size
    await page.setViewportSize({
        width: 1024,
        height: 741,
    })

    // In your test setup or beforeAll hook
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
        await page.waitForTimeout(1000)

        // await expect(page).toHaveScreenshot([snapshotPlatform, snapshotName], {
        await expect(page).toHaveScreenshot([snapshotName], {
            clip: clip,
        })
    }
}

test('autoedits-multi-line-diff-view', async ({ page, sidebar }) => {
    const lineOptions: LineOptions[] = [
        {
            lineNumber: 70,
            // clip: { x: 100, y: 300, width: 700, height: 250 },
        },
        {
            lineNumber: 76,
            // clip: { x: 100, y: 300, width: 500, height: 150 },
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
