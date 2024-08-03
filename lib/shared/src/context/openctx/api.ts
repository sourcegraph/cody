import type { Client, EachWithProviderUri, Mention, ProviderMethodOptions } from '@openctx/client'
import type * as vscode from 'vscode'
import type { MentionWithContextItemData } from './internalProvider'

type OpenCtxController = Pick<
    Client<vscode.Range>,
    'meta' | 'metaChanges__asyncGenerator' | 'mentionsChanges__asyncGenerator' | 'items'
> & {
    /**
     * Annotate that our internal `mentions` methods can return {@link MentionWithContextItemData}.
     */
    mentions: (
        ...args: Parameters<Client<vscode.Range>['mentions']>
    ) => Promise<EachWithProviderUri<(Mention | MentionWithContextItemData)[]>>

    annotationsChanges__asyncGenerator(
        doc: Pick<vscode.TextDocument, 'uri' | 'getText'>,
        opts?: ProviderMethodOptions,
        signal?: AbortSignal
    ): ReturnType<Client<vscode.Range>['annotationsChanges__asyncGenerator']>
}

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
export const WEB_PROVIDER_URI = 'internal-web-provider'
export const GIT_OPENCTX_PROVIDER_URI = 'internal-git-openctx-provider'
export const FOLDER_OPENCTX_PROVIDER_URI = 'internal-folder-openctx-provider'
