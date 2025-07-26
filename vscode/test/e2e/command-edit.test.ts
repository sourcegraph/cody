import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    test as baseTest,
    stabilizeMetadataValues,
    stabilizePrivateMetadataValues,
} from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.menu.command.default:clicked',
        'cody.menu.edit:clicked',
        'cody.command.edit:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
        'cody.fixup.user:rejected',
        'cody.fixup.codeLens:undo',
        'cody.fixup.reverted:clicked',
    ],
})('edit (fixup) task', async ({ page, sidebar, nap }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'type.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'type.ts' }).hover()

    // Place the cursor on some text within a range
    await page.getByText('appleName').click()

    // Open the Edit input
    await page.getByRole('button', { name: 'Cody Commands' }).click()
    await page.getByRole('option', { name: 'wand Edit code' }).click()

    // Check the correct model item is auto-selected
    await nap()
    const modelItem = page.getByLabel('$(anthropic-logo) Claude 3.5 Sonnet').locator('a')
    await nap()
    expect(modelItem).toBeVisible()

    // Open the model input and check it has the correct item selected
    await modelItem.click()
    const selectedModelItem = page.getByLabel('check   anthropic-logo  Claude 3.5 Sonnet, by Anthropic')
    expect(selectedModelItem).toBeVisible()

    // Back to the input box
    await page.getByRole('button', { name: /Back.*/ }).click()

    const inputBox = page.getByPlaceholder(/^Enter edit instructions \(type @ to include code/)
    const instruction = 'Replace apple with banana'
    const inputTitle = /^Edit type.ts:(\d+).* with Cody$/

    // Wait for the input box to appear with the document name in title
    await expect(page.getByText(inputTitle)).toBeVisible()
    await inputBox.focus()
    await inputBox.fill(instruction)
    await page
        .locator('a')
        .filter({ hasText: /^Submit$/ })
        .click() // Submit via Submit button

    const retryLens = page.getByRole('button', { name: 'Edit & Retry' })
    const acceptLens = page.getByRole('button', { name: 'Accept' })
    const rejectLens = page.getByRole('button', { name: 'Reject' })

    // Code Lenses should appear
    await expect(retryLens).toBeVisible()
    await expect(rejectLens).toBeVisible()
    await expect(acceptLens).toBeVisible()

    // The text in the doc should be replaced
    await nap()
    await expect(page.getByText('appleName')).not.toBeVisible()
    await expect(page.getByText('bananaName')).toBeVisible()

    // Reject: remove all the changes made by edit
    await rejectLens.click()
    await nap()
    await expect(page.getByText('appleName')).toBeVisible()
    await expect(page.getByText('bananaName')).not.toBeVisible()

    // create another edit using shortcut
    await page.getByText('appleName').click()
    await page.keyboard.press('Alt+K')
    await expect(page.getByText(inputTitle)).toBeVisible()
    await inputBox.focus()
    await inputBox.fill(instruction)
    await page.keyboard.press('Enter')
    await nap()
    await expect(page.getByText('appleName')).not.toBeVisible()
    await expect(page.getByText('bananaName')).toBeVisible()

    // Accept: remove all the changes made by edit
    await acceptLens.click()
    await nap()
    await expect(page.getByText('appleName')).not.toBeVisible()
    await expect(page.getByText('bananaName')).toBeVisible()

    const fixupApplySuccessEvent = mockServer.loggedV2Events.find(
        event => event.testId === 'cody.fixup.apply:succeeded'
    )
    stabilizeMetadataValues(['latency'], fixupApplySuccessEvent)
    stabilizePrivateMetadataValues(['taskId'], fixupApplySuccessEvent)
    expect(JSON.stringify(fixupApplySuccessEvent?.parameters, null, 2)).toMatchSnapshot()
})

test('edit (fixup) input - range selection', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Place the cursor on some text within a range
    await page.getByText("fizzbuzz.push('Buzz')").click()

    // Open the Edit input
    await page.getByRole('button', { name: 'Cody Commands' }).click()
    await page.getByRole('option', { name: 'wand Edit code' }).click()

    // Check the correct range item is auto-selected
    const rangeItem = page.getByText('Nearest Code Block')
    expect(rangeItem).toBeVisible()

    // Open the range input and check it has the correct item selected
    await rangeItem.click()
    const selectedRangeItem = page.getByLabel('check   file-code  Nearest Code Block')
    expect(selectedRangeItem).toBeVisible()

    // Open the symbols input and check it has the correct item selected
    const symbolitem = page.getByText('Select a Symbol...')
    await symbolitem.click()
    const selectedSymbolItem = page.getByLabel('symbol-method  fizzbuzz')
    await selectedSymbolItem.click()

    // Check that the range input updated correctly to reflect the selected symbol
    const inputBox = page.getByPlaceholder(/^Enter edit instructions \(type @ to include code/)
    expect(inputBox).toBeVisible()
    const updatedRangeItem = page.getByLabel('$(symbol-method) fizzbuzz')
    expect(updatedRangeItem).toBeVisible()
})
