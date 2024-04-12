import { Page, expect } from 'playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { sidebarSignin } from './common'
import { type DotcomUrlOverride, getMetaKeyByOS, test as baseTest } from './helpers'
import { acceptInlineCompletion, triggerInlineCompletion } from './utils/completions'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

/**
 * A mapping of steps in the tutorial to
 * the order of SVGs that appear as glyphs in the margin.
 */
const TUTORIAL_STEP_TO_SVG_ORDER = {
    Autocomplete: 2,
    Edit: 3,
    Fix: 4,
    Chat: 5,
}

const getTutorialState = async (
    page: Page,
    step: keyof typeof TUTORIAL_STEP_TO_SVG_ORDER
): Promise<string> => {
    const order = TUTORIAL_STEP_TO_SVG_ORDER[step]
    const icon = await page.locator(`.glyph-margin-widgets > div:nth-child(${order})`)
    const backgroundProperty = await icon.evaluate(el => {
        return window.getComputedStyle(el).getPropertyValue('background')
    })
    // Check it has been set correclty
    expect(backgroundProperty.includes('data:image/svg+xml')).toBe(true)
    return backgroundProperty
}

const triggerEdit = async (page: Page) => {
    const metaKey = getMetaKeyByOS()
    await page.keyboard.press(`${metaKey}+K`)
    // return editButton.click()
}

test('tutorial should work as expected', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await page.getByRole('treeitem', { name: 'Tutorial' }).locator('a').click()
    // Wait for tutorial to fully open
    await page.getByRole('tab', { name: 'cody_tutorial.py' }).hover()

    // START AUTOCOMPLETE TUTORIAL
    const completionState = await getTutorialState(page, 'Autocomplete')
    const completionLine = await page.locator('.view-lines > div:nth-child(16)')
    await completionLine.hover()
    await completionLine.click()

    // TODO: Ideally this completion just triggers on click, but our mocking isn't setup for that
    // This works until we support adjusting the mock _per_ test.
    await triggerInlineCompletion(page, 'myFirst')
    await acceptInlineCompletion(page)

    // Confirm that the 👉 has changed to a ✅
    const newCompletionState = await getTutorialState(page, 'Autocomplete')
    expect(newCompletionState).not.toBe(completionState)
    // END AUTOCOMPLETE TUTORIAL

    // START EDIT TUTORIAL
    const editState = await getTutorialState(page, 'Edit')
    const editLine = await page.locator('.view-lines > div:nth-child(31)')
    await editLine.hover()
    await editLine.click()
    await triggerEdit(page)
    const submitCta = await page.getByText('Submit')
    const editLine2 = await page.locator('.view-lines > div:nth-child(31)')
    await editLine2.hover()
    await editLine2.click()
    console.log(editState, submitCta)
    // END EDIT TUTORIAL
})
