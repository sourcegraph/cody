import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import { focusSidebar, getChatSidebarPanel, sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.command.explain:executed',
    ],
})('Explain Command from Prompts Tab', async ({ page, sidebar, server }) => {
    server.onGraphQl('SiteProductVersion').replyJson({
        data: { site: { productVersion: '5.9.0' } },
        capabilities: {
            edit: 'enabled',
        },
    })
    server.onGraphQl('FeatureFlags').replyJson({
        data: { evaluatedFeatureFlags: [] },
    })

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
