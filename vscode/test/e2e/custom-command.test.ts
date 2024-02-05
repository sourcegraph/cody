import { expect } from '@playwright/test'

import { loggedEvents, resetLoggedEvents, SERVER_URL } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import {
    assertEvents,
    type DotcomUrlOverride,
    test as baseTest,
    withPlatformSlashes,
    type ExpectedEvents,
} from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: SERVER_URL }).extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
    ],
})
test.beforeEach(() => {
    resetLoggedEvents()
})

test('create a new user command via the custom commands menu', async ({
    page,
    sidebar,
    expectedEvents,
}) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    // Open the new chat panel
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()

    // Minimize other sidebar items to make room for the command view,
    // else the test will fail because the Custom Command button is not visible
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()

    // Click the Custom Commands button in the Command view
    await page.getByText('Custom commands').click()

    const commandName = 'ATestCommand'
    const description = 'A test command added via menu'
    const prompt = 'The test command has been created'

    // Create a new command via menu
    await page.keyboard.type('New Custom Command...')
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    // Enter command name
    await expect(page.getByText('New Custom Cody Command: Slash Name')).toBeVisible()
    await page.keyboard.type(commandName)
    await page.keyboard.press('Enter')
    // Enter description
    await expect(page.getByText('New Custom Cody Command: Description')).toBeVisible()
    await page.keyboard.type(description)
    await page.keyboard.press('Enter')
    // Enter prompt
    await expect(page.getByText('New Custom Cody Command: Prompt')).toBeVisible()
    await page.keyboard.type(prompt)
    await page.keyboard.press('Enter')
    // Use default context
    await expect(page.getByText('New Custom Cody Command: Context Options')).toBeVisible()
    await page.keyboard.press('Enter')
    // Save it to workspace settings
    await expect(page.getByText('New Custom Cody Command: Save To…')).toBeVisible()
    await expect(page.getByText('Workspace Settings.vscode/cody.json')).toBeVisible()
    await page.getByText('Workspace Settings.vscode/cody.json').click()

    // Gives time for the command to be saved to the workspace settings
    await page.waitForTimeout(500)

    // Check if cody.json in the workspace has the new command added
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: '.vscode' }).locator('a').click()
    await page.getByRole('treeitem', { name: 'cody.json' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'cody.json' }).hover()
    // Click on minimap to scroll to the buttom
    await page.locator('canvas').nth(2).click()
    await page.getByText(commandName).hover()
    await expect(page.getByText(commandName)).toBeVisible()
    await page.getByText('index.html').first().click()

    // Show the new command in the menu and execute it
    await page.click('.badge[aria-label="Cody"]')
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByText('Cody: Custom Commands (Beta)')).toBeVisible()
    await expect(page.getByText(commandName)).toBeVisible()
    await page.getByText(commandName).click()

    // Confirm the command prompt is displayed in the chat panel on execution
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    await expect(chatPanel.getByText(prompt)).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    await assertEvents(loggedEvents, expectedEvents)
})

// NOTE: If no custom commands are showing up in the command menu, it might
// indicate a breaking change during the custom command building step.
test('execute custom commands with context defined in cody.json', async ({
    page,
    sidebar,
    expectedEvents,
}) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    // Open the chat sidebar to click on the Custom Command option
    // Search for the command defined in cody.json and execute it
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()

    // Minimize other sidebar items to make room for the command view,
    // else the test will fail because the Custom Command button is not visible
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()

    /* Test: context.currentDir with /currentDir command */
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').fill('currentDir')
    await page.keyboard.press('Enter')

    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    await expect(chatPanel.getByText('Add four context files from the current directory.')).toBeVisible()
    // Show the current file numbers used as context
    await expect(chatPanel.getByText('✨ Context: 66 lines from 5 files')).toBeVisible()
    await chatPanel.getByText('✨ Context: 66 lines from 5 files').click()
    // Display the context files to confirm no hidden files are included
    await expect(chatPanel.locator('span').filter({ hasText: '@Main.java:1-9' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@buzz.test.ts:1-12' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@buzz.ts:1-15' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@index.html:1-11' })).toBeVisible()

    /* Test: context.filePath with /filePath command */
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('/filePath')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Add lib/batches/env/var.go as context.')).toBeVisible()
    // Should show 2 files with current file added as context
    await expect(chatPanel.getByText('✨ Context: 14 lines from 2 files')).toBeVisible()

    /* Test: context.directory with /directory command */
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('/directory')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Directory has one context file.')).toBeVisible()
    await expect(chatPanel.getByText('✨ Context: 15 lines from 2 file')).toBeVisible()
    await chatPanel.getByText('✨ Context: 15 lines from 2 file').click()
    await expect(
        chatPanel.locator('span').filter({ hasText: withPlatformSlashes('@lib/batches/env/var.go:1-1') })
    ).toBeVisible()
    // Click on the file link should open the 'var.go file in the editor
    await chatPanel
        .getByRole('button', { name: withPlatformSlashes('@lib/batches/env/var.go:1-1') })
        .click()
    await expect(page.getByRole('tab', { name: 'index.html' })).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    await assertEvents(loggedEvents, expectedEvents)
    await expect(page.getByRole('tab', { name: 'var.go' })).toBeVisible()

    /* Test: context.openTabs with /openTabs command */
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('/openTabs')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Open tabs as context.')).toBeVisible()
    // The files from the open tabs should be added as context
    await expect(chatPanel.getByText('✨ Context: 14 lines from 2 files')).toBeVisible()
    await chatPanel.getByText('✨ Context: 14 lines from 2 files').click()
    await expect(chatPanel.getByRole('button', { name: '@index.html:1-10' })).toBeVisible()
    await expect(
        chatPanel.getByRole('button', { name: withPlatformSlashes('@lib/batches/env/var.go:1-0') })
    ).toBeVisible()
})

test('open and delete cody.json from the custom command menu', async ({
    page,
    sidebar,
    expectedEvents,
}) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Check if cody.json exists in the workspace
    await page.getByRole('treeitem', { name: '.vscode' }).locator('a').click()
    await page.getByRole('treeitem', { name: 'cody.json' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'cody.json' }).hover()

    await page.click('.badge[aria-label="Cody"]')

    // Minimize other sidebar items to make room for the command view,
    // else the test will fail because the Custom Command button is not visible
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()

    // Check button click to open the cody.json file in the editor
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await page.getByLabel('Configure Custom Commands...', { exact: true }).click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await expect(page.getByRole('button', { name: 'Open or Create Settings File' })).toBeVisible()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).click()
    await page.getByRole('tab', { name: 'cody.json' }).hover()
    await expect(page.getByRole('tab', { name: 'cody.json' })).toBeVisible()

    // Check button click to delete the cody.json file from the workspace tree view
    await page.getByText('Custom commands', { exact: true }).click()
    await page
        .getByLabel('Configure Custom Commands..., Manage your custom reusable commands, settings')
        .locator('a')
        .click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).click()
    // The opened cody.json file should be shown as "Deleted"
    await expect(page.getByRole('list').getByLabel(/cody.json(.*)Deleted$/)).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    await assertEvents(loggedEvents, expectedEvents)
})
