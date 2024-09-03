import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'
import { workspace } from '.'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../constants'
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

async function waitForBinaryDownloads() {}

async function waitForIndexing() {}

export async function waitForStartup() {
    //TODO: Implement this
    //TODO: make sure we can shift the timeout
    await Promise.all([waitForBinaryDownloads(), waitForIndexing()])
}

/**
 * This ensures the user is already authenticated on the mock endpoint
 */
export function preAuthenticate(ctx: Pick<UIXContextFnContext, 'workspaceDir'>) {
    return t.step('preAuthenticate', async () => {
        const secretFilePath = path.join(ctx.workspaceDir, '.vscode/cody_secrets.json')
        await fs.mkdir(path.dirname(secretFilePath), { recursive: true })
        await fs.writeFile(
            secretFilePath,
            JSON.stringify({
                token: MITM_AUTH_TOKEN_PLACEHOLDER,
            })
        )
        await workspace.modifySettings(
            s => ({ ...s, 'cody.experimental.localTokenPath': secretFilePath }),
            ctx
        )
    })
}

export namespace Config {}
