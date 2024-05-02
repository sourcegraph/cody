import type { Locator, Page } from 'playwright'

const ERROR_DECORATION_SELECTOR = 'div.view-overlays[role="presentation"] div[class*="squiggly-error"]'

export async function triggerFix(page: Page, errLocator: Locator) {
    await page.waitForSelector(ERROR_DECORATION_SELECTOR)
    await errLocator.click()
    await errLocator.hover()
    await page.getByRole('button', { name: /Quick Fix/ }).click()
    // Get by text takes a very long time, it's faster to type and let the quick fix item be focused
    await page.keyboard.type('Fix')
    await page.keyboard.press('Enter')
}
