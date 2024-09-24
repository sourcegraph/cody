import { expect, test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'

type WebViewCtx = Pick<UIXContextFnContext, 'page'>

//TODO: Refactor this to be a ExtensionChild
/**
 * A web view can be positioned anywhere
 */
export class WebView {
    private constructor(
        public readonly id: string,
        private ctx: WebViewCtx
    ) {}

    public async waitUntilReady(timeout?: number): Promise<WebView> {
        await this.ctx.page.waitForSelector(`iframe.webview.ready[name="${this.id}"]`, {
            strict: true,
            state: 'attached',
            timeout: timeout,
        })
        return this
    }

    /**
     * Can be used to check visibility
     */
    public get wrapper() {
        return this.ctx.page.locator(`div:has(> iframe.webview[name="${this.id}"])`)
    }

    /**
     * Can be used for accessing WebView Content
     */
    public get content() {
        return this.ctx.page.frameLocator(`.webview[name="${this.id}"]`).frameLocator('#active-frame')
    }

    public static all(
        ctx: WebViewCtx,
        opts: { atLeast?: number; ignoring?: Array<WebView | string>; timeout?: number } = {}
    ) {
        return t.step('Cody.WebView.all', async () => {
            const excludedIds = opts.ignoring?.map(id => (typeof id === 'string' ? id : id.id)) ?? []
            const nots = excludedIds.map(id => `:not([name="${id}"])`).join('')
            const selectorString = `iframe.webview[src*="extensionId=sourcegraph.cody-ai"]${nots}`
            const validOptions = ctx.page.locator(selectorString)

            if (opts.atLeast) {
                await expect(validOptions.nth(opts.atLeast - 1)).toBeAttached({ timeout: opts.timeout })
            }

            const ids = await validOptions.evaluateAll(frames => {
                return frames.map(frame => frame.getAttribute('name')!).filter(Boolean)
            })
            return ids.map(id => new WebView(id, ctx))
        })
    }
}

export class Extension {
    private constructor(private ctx: Pick<UIXContextFnContext, 'page' | 'workspaceDir'>) {}

    static with(init: Pick<UIXContextFnContext, 'page' | 'workspaceDir'>) {
        return new Extension(init)
    }

    get statusBar() {
        return this.ctx.page.locator('.statusbar-item[id="sourcegraph\\.cody-ai\\.extension-status"]')
    }

    get progressNotifications() {
        const toasts = this.ctx.page.locator('.notification-toast')
        return toasts.filter({
            has: this.ctx.page
                .getByLabel(/source: Cody/)
                .locator('div.monaco-progress-container.active'),
        })
    }

    async waitUntilReady() {
        return await t.step('Extension.waitUntilReady', async () => {
            await expect(this.statusBar).toBeVisible({ visible: true })
            //TODO: Convert this to binaryDownload and indexingSpecific waits
            //TODO: We probably want to also allow shifting of timeouts as download might take some time
            await expect(this.progressNotifications).toHaveCount(0)

            await Promise.all([waitForBinaryDownloads(), waitForIndexing()])
        })
    }
}

async function waitForBinaryDownloads() {}

async function waitForIndexing() {}
