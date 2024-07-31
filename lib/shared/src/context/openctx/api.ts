import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'

type OpenCtxClient = Pick<Client<vscode.Range>, 'meta' | 'mentions' | 'items' | 'dispose'>

interface OpenCtx {
    client?: OpenCtxClient
    disposable?: vscode.Disposable
}

export const openCtx: OpenCtx = {}

/**
 * Set the handle to the OpenCtx. If there is an existing handle it will be
 * disposed and replaced.
 */
export function setOpenCtx(newOpenCtx: OpenCtx): void {
    const old = { ...openCtx }

    openCtx.client = newOpenCtx.client
    openCtx.disposable = newOpenCtx.disposable

    old.client?.dispose()
    old.disposable?.dispose()
}

export const REMOTE_REPOSITORY_PROVIDER_URI = 'internal-remote-repository-search'
export const REMOTE_FILE_PROVIDER_URI = 'internal-remote-file-search'
export const WEB_PROVIDER_URI = 'internal-web-provider'
export const GIT_OPENCTX_PROVIDER_URI = 'internal-git-openctx-provider'
