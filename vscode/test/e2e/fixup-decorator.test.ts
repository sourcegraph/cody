import { expect } from '@playwright/test'

import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { assertEvents, test } from './helpers'

const DECORATION_SELECTOR = 'div.view-overlays[role="presentation"] div[class*="TextEditorDecorationType"]'

const expectedEvents = [
    'CodyVSCodeExtension:command:edit:executed',
    'CodyVSCodeExtension:keywordContext:searchDuration',
    'CodyVSCodeExtension:fixup:recipe-used',
    'CodyVSCodeExtension:fixupResponse:hasCode',
]

test.beforeEach(() => {
    resetLoggedEvents()
})

// TODO: Fix flaky test due to typewriter delay: https://github.com/sourcegraph/cody/pull/1578
test.skip('decorations from un-applied Cody changes appear', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Count the existing decorations in the file; there should be none.
    // TODO: When communication from the background process to the test runner
    // is possible, extract the FixupDecorator's decoration fields' keys and
    // select these exactly.
    const decorations = page.locator(DECORATION_SELECTOR)
    expect(await decorations.count()).toBe(0)

    // Find the text hello cody, and then highlight the text
    await page.getByText('<title>Hello Cody</title>').click()

    // Highlight the whole line
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowDown')

    // Open the command palette by clicking on the Cody Icon
    await page.getByRole('button', { name: 'Commands' }).click()
    // Navigate to fixup input
    await page.getByRole('option', { name: 'Edit code' }).click()

    // Wait for the input box to appear
    await page.getByPlaceholder('Your instructions').click()
    // Type in the instruction for fixup
    await page.keyboard.type('replace hello with goodbye')
    // Press enter to submit the fixup
    await page.keyboard.press('Enter')

    // Decorations should appear
    await page.waitForSelector(DECORATION_SELECTOR)

    // Extract the key of the decoration
    const decorationClassName = (await decorations.first().getAttribute('class'))
        ?.split(' ')
        .find(className => className.includes('TextEditorDecorationType'))
    expect(decorationClassName).toBeDefined()

    // Spray edits over where Cody planned to type to cause conflicts
    for (const ch of 'who needs titles?') {
        await page.keyboard.type(ch)
        await page.keyboard.press('ArrowRight')
    }

    // The decorations should change to conflict markers.
    await page.waitForSelector(`${DECORATION_SELECTOR}:not([class*="${decorationClassName}"])`)
    await assertEvents(loggedEvents, expectedEvents)
})
