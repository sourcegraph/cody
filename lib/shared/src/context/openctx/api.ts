import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

export type OpenCtxClient = Client<vscode.Range>

class OpenCtx {
    constructor(public client: OpenCtxClient | undefined) {}
}

export const openCtx = new OpenCtx(undefined)

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient): void {
    if (openCtx.client) {
        throw new Error('OpenCtx extension API is already set')
    }

    openCtx.client = client
}
