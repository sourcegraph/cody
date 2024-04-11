// import { expect } from '@playwright/test'

// import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
// import * as assert from 'node:assert'
// import { expect } from '@playwright/test'
// import { sidebarSignin } from './common'

import assert from 'node:assert'
import { expect } from 'playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { expectAuthenticated } from './common'
import {
    type DotcomUrlOverride,
    type ExpectedEvents,
    type TestConfiguration,
    executeCommandInPalette,
    test as baseTest,
} from './helpers'

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<TestConfiguration>({ preAuthenticate: true })

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:CodySavedLogin:executed',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:troubleshoot:reloadAuth',
        'CodyVSCodeExtension:Auth:connected',
    ],
})('allow retrying on connection issues', async ({ page, getCodySidebar }) => {
    // After Cody has loaded we prevent the server from accepting connections. On reloading
    // Cody this will now cause a connection issue when checking the currentUser.
    // After "fixing" the server Cody should be able to connect again.

    let res = await fetch(`${mockServer.SERVER_URL}/.test/connectionIssue/enable?issue=ECONNREFUSED`, {
        method: 'POST',
    })
    assert.equal(res.status, 200)

    await executeCommandInPalette(page, 'developer: reload window')

    await expect(page.getByText('connection issue', { exact: false })).toBeVisible()
    res = await fetch(`${mockServer.SERVER_URL}/.test/connectionIssue/disable`, {
        method: 'POST',
    })
    assert.equal(res.status, 200)
    const sidebar = await getCodySidebar()
    await sidebar.getByRole('button', { name: 'Retry Connection' }).click()
    expectAuthenticated(page)
})
