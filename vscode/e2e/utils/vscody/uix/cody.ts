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

    async waitUntilReady() {
        return t.step('Extension.waitUntilReady', async () => {
            await expect(this.statusBar).toBeVisible({ visible: true })
            // await this.ctx.page.waitForSelector(this.statusBar, {
            //     state: 'visible',
            // })
            //TODO: Implement this
            //TODO: make sure we can shift the timeout
            await Promise.all([waitForBinaryDownloads(), waitForIndexing()])
        })
    }
}

async function waitForBinaryDownloads() {}

async function waitForIndexing() {}
