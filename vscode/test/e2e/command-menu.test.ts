import { expect } from '@playwright/test'

import { CommandMenuOption as menu } from '../../src/commands/menus/items/options'
import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.menu.command.default:clicked',
        'cody.menu.command.default:clicked',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.auth:connected',
    ],
})('Start a new chat from Cody Command Menu', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()
    await page.getByText('<title>Hello Cody</title>').hover()
    await page.getByRole('tab', { name: 'index.html' }).click()

    // Submit a chat question via command menu using "New Chat" option in Command Menu
    await page.getByRole('button', { name: /Commands \(.*/ }).dblclick()
    const commandInputBox = page.getByPlaceholder(/Search for a command or enter/)
    await expect(commandInputBox).toBeVisible()
    await commandInputBox.fill('new chat submitted from command menu')

    // Verify all the alwaysShow items are visible
    await expect(page.getByLabel(`comment New Chat, ${menu.chat.description}`)).toBeVisible()
    await expect(page.getByLabel(`wand Edit Code, ${menu.edit.description}`)).toBeVisible()

    // this will fail if more than 1 New Chat item in the menu is found
    await page.getByLabel('Start a new chat').locator('a').click()

    // the question should show up in the chat panel on submit
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    await chatPanel.getByText('hello from the assistant').hover()
})
