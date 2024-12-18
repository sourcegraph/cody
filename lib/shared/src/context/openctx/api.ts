import type { Client } from '@openctx/client'
import type * as vscode from 'vscode'
import { DOTCOM_WORKSPACE_UPGRADE_URL } from '../..'

type OpenCtxController = Pick<
    Client<vscode.Range>,
    'meta' | 'metaChanges' | 'mentions' | 'mentionsChanges' | 'items'
> & {}

interface OpenCtx {
    controller?: OpenCtxController
    disposable?: vscode.Disposable
}

export const openCtx: OpenCtx = {}

/**
 * Set the handle to the OpenCtx. If there is an existing handle it will be
 * disposed and replaced.
 */
export function setOpenCtx({ controller, disposable }: OpenCtx): void {
    const { disposable: oldDisposable } = openCtx

    openCtx.controller = controller
    openCtx.disposable = disposable

    oldDisposable?.dispose()
}

export const REMOTE_REPOSITORY_PROVIDER_URI = 'internal-remote-repository-search'
export const REMOTE_FILE_PROVIDER_URI = 'internal-remote-file-search'
export const REMOTE_DIRECTORY_PROVIDER_URI = 'internal-remote-directory-search'
export const WEB_PROVIDER_URI = 'internal-web-provider'
export const GIT_OPENCTX_PROVIDER_URI = 'internal-git-openctx-provider'
export const CODE_SEARCH_PROVIDER_URI = 'internal-code-search-provider'
export const WORKSPACE_DIRECTORY_PROVIDER_URI = DOTCOM_WORKSPACE_UPGRADE_URL.href + '?workspace=dir'
export const WORKSPACE_REPOSITORY_PROVIDER_URI = DOTCOM_WORKSPACE_UPGRADE_URL.href + '?workspace=repo'

export function isRemoteWorkspaceProvider(uri: string): boolean {
    return uri === WORKSPACE_DIRECTORY_PROVIDER_URI || uri === WORKSPACE_REPOSITORY_PROVIDER_URI
}
