import type { Locator, Page } from 'playwright'

export async function triggerInlineCompletion(
    page: Page,
    prefix: string,
    afterElement?: Locator
): Promise<void> {
    if (afterElement) {
        await afterElement?.click()
        await page.keyboard.press('End')
        await page.keyboard.press('Enter')
    }

    await page.keyboard.type(prefix)

    // TODO: Fix flaky
    // Wait for ghost text to become visible.
    await page.locator('.ghost-text-decoration').waitFor({ state: 'visible' })
}

export async function acceptInlineCompletion(page: Page): Promise<void> {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
}
