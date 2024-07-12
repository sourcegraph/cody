import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

type OpenCtxClient = Pick<Client<vscode.Range>, 'meta' | 'mentions' | 'items'>

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
