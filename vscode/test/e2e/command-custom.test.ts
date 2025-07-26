import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import {
    expectContextCellCounts,
    getChatEditorPanel,
    getContextCell,
    openContextCell,
    sidebarExplorer,
    sidebarSignin,
} from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    test as baseTest,
    executeCommandInPalette,
    openCodyCommandsQuickPick,
    openCustomCommandMenu,
    withPlatformSlashes,
} from './helpers'
import { testGitWorkspace } from './utils/gitWorkspace'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.beforeEach(() => {
    mockServer.resetLoggedEvents()
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.menu.command.custom:clicked',
        'cody.menu.custom.build:clicked',
        'cody.command.custom.build:executed',
        'cody.command.custom:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('create a new user command via the custom commands menu', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Bring the cody sidebar to the foreground
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()

    // Verify the default commands are not showing up as custom commands in the menu.
    // Meaning it should only shouw up once in the command menu.
    await openCodyCommandsQuickPick(page)
    await expect(page.getByText('Explain Code', { exact: true })).toBeVisible()

    // Click the Custom Commands button in the Sidebar to open the Custom Commands menu
    await openCustomCommandMenu(page)
    await expect(page.getByText('Explain Code', { exact: true })).not.toBeVisible()

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
    const commandInputBox = page.getByPlaceholder('e.g. spellchecker')
    await commandInputBox.fill(commandName)
    await commandInputBox.press('Enter')

    // Select mode
    const commandModeTitle = page.getByText('New Custom Cody Command: Command Mode')
    await expect(commandModeTitle).toBeVisible()
    // Hit enter to select the first option on the list: 'ask'
    await page.keyboard.press('Enter')

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
    await expect(page.getByText('Workspace Settings.vscode/cody.json')).toBeVisible()
    await page.getByText('Workspace Settings.vscode/cody.json').click()

    await executeCommandInPalette(page, 'Custom Commands')
    await page.getByText('ATestCommand').click()

    // Confirm the command prompt is displayed in the chat panel on execution
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    await expect(chatPanel.getByText(prompt)).toBeVisible()
    // Close the index.html file
    await page.getByRole('tab', { name: 'index.html' }).hover()
    await page.getByLabel('index.html', { exact: true }).getByLabel(/Close/).click()

    // The new command should show up
    await openCustomCommandMenu(page)
    await expect(page.getByText(commandName)).toBeVisible({ timeout: 1000 })
})

// NOTE: If no custom commands are showing up in the command menu, it might
// indicate a breaking change during the custom command building step.
test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.menu.command.custom:clicked',
        'cody.command.custom:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.ghostText:visible',
    ],
})('execute custom commands with context defined in cody.json', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Open the chat sidebar to click on the Custom Command option
    // Search for the command defined in cody.json and execute it
    await openCustomCommandMenu(page)

    /* Test: context.currentDir with currentDir command */
    await executeCommandInPalette(page, 'Custom Commands')
    await page.getByText('currentDir').click()

    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    await expect(chatPanel.getByText('Add four context files from the current directory.')).toBeVisible()

    // Show the current file numbers used as context
    const contextCell = getContextCell(chatPanel)
    await expectContextCellCounts(contextCell, { files: 7 })
    await openContextCell(contextCell)
    // Display the context files to confirm no hidden files are included
    await expect(chatPanel.getByRole('button', { name: '.mydotfile:1-2' })).not.toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'error.ts:1-9' })).toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'Main.java:1-9' })).toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'buzz.test.ts:1-12' })).toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'buzz.ts:1-15' })).toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'index.html:1-11' })).toBeVisible()

    /* Test: context.filePath with filePath command */
    // Locate the filePath command in the tree view and execute it from there to verify
    // custom commands are working in the sidebar
    await executeCommandInPalette(page, 'Custom Commands')
    await page.getByText('filePath').click()
    await expect(chatPanel.getByText('Add lib/batches/env/var.go as context.')).toBeVisible()
    // Should show 2 files with current file added as context
    await expectContextCellCounts(contextCell, { files: 2 })

    /* Test: context.directory with directory command */

    await openCustomCommandMenu(page)
    await executeCommandInPalette(page, 'Custom Commands')
    await page.getByText('directoryPath').click()
    await expect(chatPanel.getByText('Directory has one context file.')).toBeVisible()
    await expectContextCellCounts(contextCell, { files: 2 })
    await openContextCell(contextCell)
    await expect(
        chatPanel.getByRole('button', { name: withPlatformSlashes('var.go:1 lib/batches/env') })
    ).toBeVisible()
    // Click on the file link should open the 'var.go file in the editor
    await contextCell
        .getByRole('button', { name: withPlatformSlashes('var.go:1 lib/batches/env') })
        .click()
    await expect(page.getByRole('tab', { name: 'var.go' })).toBeVisible()

    /* Test: context.openTabs with openTabs command */

    await openCustomCommandMenu(page)
    await executeCommandInPalette(page, 'Custom Commands')
    await page.getByText('openTabs').click()
    await expect(chatPanel.getByText('Open tabs as context.')).toBeVisible()

    // The files from the open tabs should be added as context
    await expectContextCellCounts(contextCell, { files: 2 })
    await openContextCell(contextCell)
    await expect(contextCell.getByRole('button', { name: 'index.html' })).toBeVisible()
    await expect(
        contextCell.getByRole('button', { name: withPlatformSlashes('var.go lib/batches/env') })
    ).toBeVisible()
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.menu.command.custom:clicked',
        'cody.menu.command.config:clicked',
    ],
})('open and delete cody.json from the custom command menu', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Check if cody.json exists in the workspace
    await page.getByRole('treeitem', { name: '.vscode' }).locator('a').click()
    await page.getByRole('treeitem', { name: 'cody.json' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'cody.json' }).hover()

    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await openCustomCommandMenu(page)

    // Able to open the cody.json file in the editor from the command menu
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByLabel('Configure Custom Commands...', { exact: true }).click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await expect(page.getByRole('button', { name: 'Open or Create Settings File' })).toBeVisible()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).click()

    // Close file.
    const codyJSONFileTab = page.getByRole('tab', { name: 'cody.json' })
    await page.getByRole('tab', { name: 'cody.json' }).hover()
    await expect(codyJSONFileTab).toBeVisible()
    await codyJSONFileTab.getByRole('button', { name: /^Close/ }).click()

    // Check button click to delete the cody.json file from the workspace tree view
    await openCustomCommandMenu(page)
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByLabel('Configure Custom Commands...', { exact: true }).click()
    await page.locator('a').filter({ hasText: 'Open Workspace Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).hover()
    await page.getByRole('button', { name: 'Delete Settings File' }).click()
    // Because we have turned off notification, we will need to check the notification center
    // for the deletion-confirmation message.
    await page.getByRole('button', { name: 'Do Not Disturb' }).click()
    await page.getByRole('button', { name: /^Move to / }).click() // Move to trash on Mac and bin on Windows

    // Confirm cody.json has been deleted from workspace
    await sidebarExplorer(page).click()
    await expect(page.getByRole('treeitem', { name: 'cody.json' }).locator('a')).not.toBeVisible()

    // Open the cody.json from User Settings

    // NOTE: This is expected to fail locally if you currently have User commands configured
    await page.waitForTimeout(100)
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await openCustomCommandMenu(page)
    await page.locator('a').filter({ hasText: 'Open User Settings (JSON)' }).hover()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).hover()
    await page.getByRole('button', { name: 'Open or Create Settings File' }).click()
    await page.getByRole('tab', { name: 'cody.json, preview' }).hover()
    await expect(page.getByRole('tab', { name: 'cody.json, preview' })).toHaveCount(1)
})

testGitWorkspace('use terminal output as context', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    // Open the Source Control View to confirm this is a git workspace
    // Check the change is showing as a Git file in the sidebar
    const sourceControlView = page.getByLabel(/Source Control/).nth(2)
    await sourceControlView.click()
    await page.locator('h2').filter({ hasText: 'Source Control' }).hover()
    await page.getByText('index.js').hover()
    await page.locator('a').filter({ hasText: 'index.js' }).click()

    // Run the custom command that uses terminal output as context
    await page.getByRole('button', { name: 'Cody Commands' }).click()
    const menuInputBox = page.getByPlaceholder('Search for a command or enter your question here...')
    await expect(menuInputBox).toBeVisible()
    await menuInputBox.fill('shellOutput')
    await page.keyboard.press('Enter')

    await expect(menuInputBox).not.toBeVisible()

    // Check the context list to confirm the terminal output is added as file
    const panel = getChatEditorPanel(page)
    const contextCell = getContextCell(panel)
    await expectContextCellCounts(contextCell, { files: 2 })
    await openContextCell(contextCell)
    await expect(
        contextCell.getByRole('button', { name: withPlatformSlashes('git diff') })
    ).toBeVisible()
})
