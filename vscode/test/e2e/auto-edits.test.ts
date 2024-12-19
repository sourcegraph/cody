import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExtraWorkspaceSettings,
    test as baseTest,
} from './helpers'

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExtraWorkspaceSettings>({
        'cody.experimental.autoedits.enabled': true,
    })

test('edit (fixup) input - range selection', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()
    const autoeditLine = await page.locator('.view-lines > div:nth-child(12)')
    await autoeditLine.hover();
    await autoeditLine.click();
    await page.keyboard.type(' else {')

    // Trigger command using keyboard shortcut
    await page.keyboard.press('Meta+Shift+P');
    await page.keyboard.type('Cody: Autoedits Manual Trigger');
    await page.waitForTimeout(1000);

    await page.keyboard.press('Enter');

    await page.waitForTimeout(10000)
});
