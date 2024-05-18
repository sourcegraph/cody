import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

export type OpenCtxClient = Client<vscode.Range>

class OpenCtx {
    private _client: OpenCtxClient | undefined

    constructor(client: OpenCtxClient | undefined) {
        this._client = client
    }

    /**
     * Get the handle to the OpenCtx client.
     */
    public get client(): OpenCtxClient | undefined {
        return this._client
    }

    public setClient(client: OpenCtxClient): void {
        this._client = client
    }
}

export const openCtx = new OpenCtx(undefined)

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient): void {
    if (openCtx.client) {
        throw new Error('OpenCtx extension API is already set')
    }

    openCtx.setClient(client)
}
