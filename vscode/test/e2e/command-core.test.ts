import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import { focusSidebar, getChatSidebarPanel, sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    test as baseTest,
    executeCommandInPalette,
} from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.command.codelens:clicked',
        'cody.menu.command.default:clicked',
        'cody.command.test:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
    ],
})('Generate Unit Test Command (Edit)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on the Cody command code lenses to execute the unit test command
    await page.getByRole('button', { name: 'A Cody' }).click()
    await page.getByText('Generate Unit Tests').click()

    // The test file for the buzz.ts file should be opened automatically
    await page.getByText('buzz.test.ts').hover()

    // Code lens should be visible
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.command.doc:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
    ],
})('Document Command (Edit)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on some code within the function
    await page.getByText("fizzbuzz.push('Buzz')").click()

    // Bring the cody sidebar to the foreground
    await focusSidebar(page)

    // Trigger the documentaton command
    await executeCommandInPalette(page, 'Document Code')

    // Code lens should be visible.
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible({
        // Wait a bit longer because formatting can sometimes be slow.
        timeout: 10000,
    })
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()

    // Code lens should be at the start of the function (range expanded from click position)
    await expect(page.getByText('* Mocked doc string')).toBeVisible()
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.command.explain:executed',
    ],
})('Explain Command from Prompts Tab', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on some code within the function
    await page.getByText("fizzbuzz.push('Buzz')").click()

    // Execute the command from the Commands tab in Chat view
    await focusSidebar(page)

    // Click on the Commands view icon from the tab bar.
    const sidebarChat = getChatSidebarPanel(page)
    const sidebarTab = sidebarChat.getByTestId('tab-prompts')
    await sidebarTab.click()
    await sidebarChat.getByRole('option', { name: 'Explain Code' }).click()

    // Click on a command from the sidebar should not start a new Editor window when sidebar is empty.
    await expect(sidebarChat.getByText('hello from the assistant')).toBeVisible()
    await expect(sidebarChat.getByRole('option', { name: 'Explain Code' })).not.toBeVisible()
})
