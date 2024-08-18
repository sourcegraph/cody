import fs from 'node:fs/promises'
import path from 'node:path'
import { type Locator, expect, test as t } from '@playwright/test'
import type { UIXContextFnContext } from '.'
import { workspace } from '.'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../constants'

export interface ChatConversationCtx {
    webview: WebView
}
export class ChatConversation {
    private constructor(private ctx: ChatConversationCtx) {}

    userMessage(nth = 0) {
        return new UserMessage({
            ...this.ctx,
            message: this.ctx.webview.content.getByTestId('message').nth(nth),
        })
    }

    //TODO: Implement more nice helpers

    public static get(ctx: ChatConversationCtx) {
        return new ChatConversation(ctx)
    }
}

class UserMessage {
    constructor(private ctx: ChatConversationCtx & { message: Locator }) {}

    get textInput(): Locator {
        // <div aria-label="Chat message" class="_content-editable_14ket_24 _editor-content-editable_1nptu_47" contenteditable="true" role="textbox" spellcheck="true" data-lexical-editor="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;"><p class="_theme-paragraph_14ket_48"><br></p></div>
        return this.ctx.message.locator('[role="textbox"][aria-label="Chat message"]')
    }

    get toolbar(): Locator {
        return this.ctx.message.locator('menu[role="toolbar"]')
    }

    async submit(): Promise<void> {
        return t.step('Submitting chat', async () => {
            await this.ctx.message.getByRole('button', { name: 'Send' }).click()
            // Note: if this fails you might not have any reasonable request delay set
            // in the mitm proxy.
            await expect(this.ctx.webview.content.getByRole('button', { name: 'Stop' })).toBeVisible()
        })
    }

    abort(): Promise<void> {
        return t.step('Aborting chat', async () => {
            // Note: if this fails you might not have any reasonable request delay set
            // in the mitm proxy.
            await this.ctx.message.getByRole('button', { name: 'Stop' }).click()
            await expect(this.ctx.webview.content.getByRole('button', { name: 'Send' })).toBeVisible()
        })
    }
}

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
