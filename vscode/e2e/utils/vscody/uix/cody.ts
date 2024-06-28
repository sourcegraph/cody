import { expect, test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'
type WebViewCtx = Pick<UIXContextFnContext, 'page'>

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
            const nots = excludedIds.map(id => `:not([name="${id}"`).join('')
            const validOptions = ctx.page.locator(
                `iframe.webview[src*="extensionId=sourcegraph.cody-ai"]${nots}`
            )

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

export async function dummy() {
    console.log('DUMMY')
}

export async function waitForBinaryDownloads() {}

export async function waitForIndexing() {}

export async function waitForStartup() {
    await Promise.all([waitForBinaryDownloads(), waitForIndexing()])
}

export async function sidebar<R = any>(
    withSidebar: (sidebar: any) => Promise<R>,
    ctx: Pick<UIXContextFnContext, 'page'>
): Promise<R> {
    //todo: IFRAME Locator
    const frame = await ctx.page.frameLocator('iframe')
    return await withSidebar(frame)
}
