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
    lineOptions: LineOptions[]
}

const autoeditsTestHelper = async ({
    page,
    sidebar,
    fileName,
    lineOptions,
}: AutoeditsTestOptions): Promise<void> => {
    // Use a large number to go the end of the line
    const maxColumnNumber = Number.MAX_SAFE_INTEGER

    // Fix the viewport size
    await page.setViewportSize({
        width: 1024,
        height: 741,
    })

    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Go to the auto-edits directory in the workspace
    await page.getByRole('treeitem', { name: 'auto-edits' }).locator('a').click()
    await page.getByRole('treeitem', { name: fileName }).locator('a').click()

    await page.waitForTimeout(500)

    // Close the explorer view
    await sidebarExplorer(page).click()

    for (const { lineNumber, clip } of lineOptions) {
        await executeCommandInPalette(page, 'Go to Line/Column')
        await page.keyboard.type(`${lineNumber}:${maxColumnNumber}`)
        await page.keyboard.press('Enter')

        await executeCommandInPalette(page, 'Cody: Autoedits Manual Trigger')

        // Wait for the diff view to stabilize - required to reduce flakiness
        await page.waitForTimeout(1000)

        await expect(page).toHaveScreenshot({ clip })
    }
}

test('autoedits-multi-line-diff-view', async ({ page, sidebar }) => {
    const lineOptions: LineOptions[] = [
        {
            lineNumber: 70,
            clip: { x: 100, y: 300, width: 700, height: 250 },
        },
        {
            lineNumber: 76,
            clip: { x: 100, y: 300, width: 500, height: 150 },
        },
    ]
    await autoeditsTestHelper({ page, sidebar, fileName: 'diff-view-example-1.py', lineOptions })
})
