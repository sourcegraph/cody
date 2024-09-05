import { expect } from '@playwright/test'
import { escapeRegExp } from 'lodash'
import { SessionChild } from './sessionChild'

export class Sidebar extends SessionChild {
    public static readonly CODY_VIEW_ID = 'workbench.view.extension.cody'

    public get locator() {
        return this.session.page.locator('#workbench\\.parts\\.sidebar')
    }

    private get splitViewContainer() {
        return this.locator.locator('xpath=ancestor::*[contains(@class, "split-view-view")]').last()
    }

    /**
     * The viewlet is the content of the sidebar. Any webview will get
     * positioned as anchored to this.
     */
    private get viewlet() {
        return this.locator.locator('.composite.viewlet').first()
    }

    public get activeView() {
        return this.viewlet.getAttribute('id')
    }

    public readonly expect = {
        toBeVisible: (options?: { timeout?: number }) =>
            expect(this.splitViewContainer).toHaveClass(/\bvisible\b/, options),
        toBeHidden: (options?: { timeout?: number }) =>
            expect(this.splitViewContainer).not.toHaveClass(/\bhidden\b/, options),
        toHaveActiveView: (view: 'cody' | { id: string } = 'cody', options?: { timeout?: number }) =>
            expect(this.viewlet).toHaveId(
                RegExp(escapeRegExp(view === 'cody' ? Sidebar.CODY_VIEW_ID : view.id)),
                {
                    ...options,
                }
            ),
    }
}
