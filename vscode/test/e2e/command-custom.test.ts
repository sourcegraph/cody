import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import { getChatPanel, sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExpectedEvents,
    test as baseTest,
    withPlatformSlashes,
} from './helpers'
import { testGitWorkspace } from './utils/gitWorkspace'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.beforeEach(() => {
    mockServer.resetLoggedEvents()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:menu:command:custom:clicked',
        'CodyVSCodeExtension:menu:custom:build:clicked',
        'CodyVSCodeExtension:command:custom:build:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:command:custom:executed',
    ],
})('create a new user command via the custom commands menu', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await expect(page.getByRole('tab', { name: 'index.html' })).toBeVisible()

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
    await page.getByText('Custom Commands').click()

    const commandName = 'ATestCommand'
    const prompt = 'The test command has been created'

    // Create a new command via menu
    await page.keyboard.type('New Custom Command...')
    await page
        .locator('a')
        .filter({ hasText: /New Custom Command.../ })
        .click()
    // Enter command name
    const commandInputTitle = page.getByText('New Custom Cody Command: Command Name')
    await expect(commandInputTitle).toBeVisible()
    const commandInputBox = page.getByPlaceholder('e.g. hello')
    await commandInputBox.fill(commandName)
    await commandInputBox.press('Enter')
    // Enter prompt
    const promptInputTitle = page.getByText('New Custom Cody Command: Prompt')
    await expect(promptInputTitle).toBeVisible()
    const promptInputBox = page.getByPlaceholder(
        'e.g. Create five different test cases for the selected code'
    )
    await promptInputBox.fill(prompt)
    await promptInputBox.press('Enter')
    // Use default context
    await expect(page.getByText('New Custom Cody Command: Context Options')).toBeVisible()
    await page.keyboard.press('Enter')
    // Save it to workspace settings
    await expect(page.getByText('New Custom Cody Command: Save To…')).toBeVisible()
    await page.getByText('Workspace Settings.vscode/cody.json').click()

    // Gives time for the command to be saved to the workspace settings
    await page.waitForTimeout(500)

    // Check if cody.json in the workspace has the new command added
    await sidebarExplorer(page).click()
    await page.getByLabel('.vscode', { exact: true }).click()
    await page.getByRole('treeitem', { name: 'cody.json' }).locator('a').dblclick()
    await expect(page.getByRole('tab', { name: 'cody.json' })).toBeVisible()
    // Click on minimap to scroll to the buttom
    await page.locator('canvas').nth(2).click()
    await expect(page.getByText(commandName)).toBeVisible()
    await page.getByText('index.html').first().click()

    // Show the new command in the menu and execute it
    await page.click('.badge[aria-label="Cody"]')
    await page.getByLabel('Custom Commands').locator('a').click()
    await expect(page.getByText('Cody: Custom Commands (Beta)')).toBeVisible()
    const newCommandMenuItem = page.getByLabel('tools  ATestCommand, The test command has been created')
    const newCommandSidebarItem = page.getByRole('treeitem', { name: 'ATestCommand' }).locator('a')
    await expect(page.getByText(commandName)).toHaveCount(2) // one in sidebar, and one in menu
    await expect(newCommandMenuItem).toBeVisible()
    await expect(newCommandSidebarItem).toBeVisible()
    await newCommandMenuItem.click()

    // Confirm the command prompt is displayed in the chat panel on execution
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    await expect(chatPanel.getByText(prompt)).toBeVisible()
})

// NOTE: If no custom commands are showing up in the command menu, it might
// indicate a breaking change during the custom command building step.
test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:menu:command:custom:clicked',
        'CodyVSCodeExtension:command:custom:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
    ],
})('execute custom commands with context defined in cody.json', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await expect(page.getByRole('tab', { name: 'index.html' })).toBeVisible()

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

    /* Test: context.currentDir with currentDir command */
    await page.getByRole('treeitem', { name: 'Custom Commands' }).locator('a').click()
    await page.getByPlaceholder('Search command to run...').fill('currentDir')
    await page.keyboard.press('Enter')

    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    await expect(chatPanel.getByText('Add four context files from the current directory.')).toBeVisible()
    // Show the current file numbers used as context
    await chatPanel.getByText('✨ Context: 56 lines from 5 files').click()
    // Display the context files to confirm no hidden files are included
    await expect(chatPanel.locator('details').filter({ hasText: '.mydotfile:1-2' })).not.toBeVisible()
    await expect(chatPanel.locator('details').filter({ hasText: 'error.ts:1-9' })).toBeVisible()
    await expect(chatPanel.locator('details').filter({ hasText: 'Main.java:1-9' })).toBeVisible()
    await expect(chatPanel.locator('details').filter({ hasText: 'buzz.test.ts:1-12' })).toBeVisible()
    await expect(chatPanel.locator('details').filter({ hasText: 'buzz.ts:1-15' })).toBeVisible()
    await expect(chatPanel.locator('details').filter({ hasText: 'index.html:1-11' })).toBeVisible()

    /* Test: context.filePath with filePath command */

    await page.getByRole('treeitem', { name: 'Custom Commands' }).locator('a').click()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('filePath')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Add lib/batches/env/var.go as context.')).toBeVisible()
    // Should show 2 files with current file added as context
    await expect(chatPanel.getByText('✨ Context: 12 lines from 2 files')).toBeVisible()

    /* Test: context.directory with directory command */

    await page.getByRole('treeitem', { name: 'Custom Commands' }).locator('a').click()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('directory')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Directory has one context file.')).toBeVisible()
    await chatPanel.getByText('✨ Context: 12 lines from 2 file').click()
    await expect(
        chatPanel.locator('details').filter({ hasText: withPlatformSlashes('lib/batches/env/var.go:1') })
    ).toBeVisible()
    // Click on the file link should open the 'var.go file in the editor
    const chatContext = chatPanel.locator('details').last()
    await chatContext
        .getByRole('link', { name: withPlatformSlashes('lib/batches/env/var.go:1') })
        .click()
    await expect(page.getByRole('tab', { name: 'var.go' })).toBeVisible()

    /* Test: context.openTabs with openTabs command */

    await page.getByRole('treeitem', { name: 'Custom Commands' }).locator('a').click()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('openTabs')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Open tabs as context.')).toBeVisible()
    // The files from the open tabs should be added as context
    await chatPanel.getByText('✨ Context: 12 lines from 2 files').click()
    await expect(chatContext.getByRole('link', { name: 'index.html:1-11' })).toBeVisible()
    await expect(
        chatContext.getByRole('link', { name: withPlatformSlashes('lib/batches/env/var.go:1') })
    ).toBeVisible()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:menu:command:custom:clicked',
        'CodyVSCodeExtension:menu:command:config:clicked',
    ],
})('open and delete cody.json from the custom command menu', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Check if cody.json exists in the workspace
    await page.getByRole('treeitem', { name: '.vscode' }).locator('a').click()
    await page.getByRole('treeitem', { name: 'cody.json' }).locator('a').dblclick()
    await expect(page.getByRole('tab', { name: 'cody.json' })).toBeVisible()

    await page.click('.badge[aria-label="Cody"]')

    // Minimize other sidebar items to make room for the command view,
    // else the test will fail because the Custom Command button is not visible
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()

    // Check button click to open the cody.json file in the editor
    // const label = 'gear  Configure Custom Commands..., Manage your custom reusable commands, settings'
    // const configMenuItem = page.getByLabel(label).locator('a')
    const customCommandSidebar = page.getByRole('treeitem', { name: 'Custom Commands' }).locator('a')

    // Able to open the cody.json file in the editor from the command menu
    await customCommandSidebar.click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByLabel('Configure Custom Commands...', { exact: true }).click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).click()
    await expect(page.getByRole('tab', { name: 'cody.json' })).toBeVisible()

    // Check button click to delete the cody.json file from the workspace tree view
    await customCommandSidebar.click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByLabel('Configure Custom Commands...', { exact: true }).click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).click()

    // Because we have turned off notification, we will need to check the notification center
    // for the confirmation message.
    await page.getByRole('button', { name: 'Do Not Disturb' }).click()
    await page.getByRole('button', { name: /^Move to / }).click()

    // The opened cody.json file should be shown as "Deleted"
    await expect(page.getByRole('list').getByLabel(/cody.json(.*)Deleted$/)).toBeVisible()

    // Open the cody.json from User Settings
    // NOTE: This is expected to fail locally if you currently have User commands configured
    await page.waitForTimeout(100)
    await customCommandSidebar.click()
    await page.locator('a').filter({ hasText: 'Open User Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).hover()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).click()
    await expect(page.getByRole('tab', { name: 'cody.json, preview' })).toHaveCount(1)
})

testGitWorkspace('use terminal output as context', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    // Open the Source Control View to confirm this is a git workspace
    // Check the change is showing as a Git file in the sidebar
    const sourceControlView = page.getByLabel(/Source Control/).nth(2)
    await sourceControlView.click()
    await expect(page.getByRole('heading', { name: 'Source Control' })).toBeVisible()
    await page.locator('a').filter({ hasText: 'index.js' }).click()

    // Run the custom command that uses terminal output as context
    await page.getByRole('button', { name: 'Commands' }).click()
    const menuInputBox = page.getByPlaceholder('Search for a command or enter your question here...')
    await expect(menuInputBox).toBeVisible()
    await menuInputBox.fill('shellOutput')
    await page.keyboard.press('Enter')

    // Check the context list to confirm the terminal output is added as file
    const panel = getChatPanel(page)
    await panel.getByText('✨ Context: 1 line from 2 files').click()
    const chatContext = panel.locator('details').last()
    await expect(
        chatContext.getByRole('link', { name: withPlatformSlashes('/terminal-output') })
    ).toBeVisible()
})
