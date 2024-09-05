import { type Locator, test as t } from '@playwright/test'
import { SessionChild } from './sessionChild'

export class QuickPick extends SessionChild {
    get locator() {
        return this.session.page.locator('.quick-input-widget')
    }

    get title() {
        return this.locator.locator('.quick-input-titlebar').locator('.quick-input-title')
    }

    get selectAllCheckbox() {
        return this.locator
            .locator('.quick-input-header')
            .locator('input.quick-input-check-all[type="checkbox"]')
    }

    get input() {
        return this.locator
            .locator('.quick-input-header')
            .locator('.quick-input-box')
            .locator('input.input')
    }

    dismiss(options?: { skipIfHidden?: boolean }): Promise<boolean> {
        return t.step('quickPick.dismissIfVisible', async () => {
            const doDismiss = await t
                .expect(this.locator)
                .toBeVisible({})
                .then(() => true)
                .catch(e => {
                    if (options?.skipIfHidden && e.message.includes('not visible')) {
                        return false
                    }
                    throw e
                })
            if (doDismiss) {
                await this.locator.press('Escape')
            }

            // TODO: We can't just check that it's now hidden as closing one quickpick can open another.
            // await t.expect(this.locator).toBeHidden()
            return doDismiss
        })
    }

    items(options?: {
        has?: Locator
        hasNot?: Locator
        hasNotText?: string | RegExp
        hasText?: string | RegExp
    }) {
        return this.locator.locator('.quick-input-list').locator('.monaco-list-row', options)
    }
    //TODO: Quick Input Action OK
    //TODO: Quick Input Custom Action
}
