import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { openFileInEditorTab, sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, test as baseTest } from './helpers'

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
        'cody.menu.command.default:clicked',
        'cody.menu.edit:clicked',
        'cody.command.edit:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
        'cody.fixup.user:rejected',
        'cody.fixup.codeLens:undo',
        'cody.fixup.reverted:clicked',
        'cody.sidebar.edit:clicked',
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
    await page.getByRole('option', { name: 'Edit code' }).click()

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

    const acceptLens = page.getByRole('button', { name: 'Accept' })
    const retryLens = page.getByRole('button', { name: 'Edit & Retry' })
    const undoLens = page.getByRole('button', { name: 'Undo' })

    // Code Lenses should appear
    await expect(acceptLens).toBeVisible()
    await expect(retryLens).toBeVisible()
    await expect(undoLens).toBeVisible()

    // The text in the doc should be replaced
    await nap()
    await expect(page.getByText('appleName')).not.toBeVisible()
    await expect(page.getByText('bananaName')).toBeVisible()

    // Undo: remove all the changes made by edit
    await undoLens.click()
    await nap()
    await expect(page.getByText('appleName')).toBeVisible()
    await expect(page.getByText('bananaName')).not.toBeVisible()

    // create another edit from the sidebar Edit button
    await page.getByText('appleName').click()
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await page.getByText('Edit Code').click()
    await expect(page.getByText(inputTitle)).toBeVisible()
    await inputBox.focus()
    await inputBox.fill(instruction)
    await page.keyboard.press('Enter')

    await nap()
    await expect(page.getByText('appleName')).not.toBeVisible()
    await expect(page.getByText('bananaName')).toBeVisible()
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
    await page.getByRole('option', { name: 'Edit code' }).click()

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

test('edit (fixup) input - model selection', async ({ page, nap, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    await openFileInEditorTab(page, 'buzz.ts')

    // Open the Edit input
    await page.getByRole('button', { name: 'Cody Commands' }).click()
    await page.getByRole('option', { name: 'Edit code' }).click()

    // Check the correct model item is auto-selected
    await nap()
    const modelItem = page.getByText('Claude 3 Sonnet')
    await nap()
    expect(modelItem).toBeVisible()

    // Open the model input and check it has the correct item selected
    await modelItem.click()
    const selectedModelItem = page.getByLabel('check   anthropic-logo  Claude 3 Sonnet, by Anthropic')
    expect(selectedModelItem).toBeVisible()
})
