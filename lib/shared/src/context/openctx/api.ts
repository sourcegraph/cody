import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

type OpenCtxClient = Pick<
    Client<vscode.Range>,
    | 'meta'
    | 'metaChanges__asyncGenerator'
    | 'mentions'
    | 'mentionsChanges__asyncGenerator'
    | 'items'
    | 'annotationsChanges__asyncGenerator'
>

export const openCtx: { client: OpenCtxClient | undefined } = { client: undefined }

/**
 * Set the handle to the OpenCtx client.
 */
export function setOpenCtxClient(client: OpenCtxClient): void {
    openCtx.client = client
}

export const REMOTE_REPOSITORY_PROVIDER_URI = 'internal-remote-repository-search'
export const REMOTE_FILE_PROVIDER_URI = 'internal-remote-file-search'
export const WEB_PROVIDER_URI = 'internal-web-provider'
export const GIT_OPENCTX_PROVIDER_URI = 'internal-git-openctx-provider'
