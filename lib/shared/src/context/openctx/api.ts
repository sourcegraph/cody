import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

type OpenCtxClient = Client<vscode.Range>

let _client: OpenCtxClient | undefined

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient | undefined): void {
    if (_client) {
        throw new Error('OpenCtx extension API is already set')
    }
    _client = client
}

/**
 * Get a handle to the OpenCtx client, set in {@link setOpenCtxClient}.
 */
export function getOpenCtxClient(): OpenCtxClient | undefined {
    return _client
}
