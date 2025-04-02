import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
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
        'cody.command.codelens:clicked',
        'cody.menu.command.default:clicked',
        'cody.command.test:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
    ],
})('Generate Unit Test Command (Edit)', async ({ page, sidebar, server }) => {
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

    // Click on the Cody command code lenses to execute the unit test command
    await page.getByRole('button', { name: 'A Cody' }).click()
    await page.getByText('Generate Unit Tests').click()

    // The test file for the buzz.ts file should be opened automatically
    await page.getByText('buzz.test.ts').hover()

    // Code lens should be visible
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible()
})
