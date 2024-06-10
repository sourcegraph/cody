import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

type OpenCtxClient = Client<vscode.Range>

class OpenCtx {
    constructor(public client: OpenCtxClient | undefined) {}
}

export const openCtx = new OpenCtx(undefined)

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient): void {
    openCtx.client = client
}
