import type { Client } from '@openctx/client'
import type { Observable } from 'observable-fns'
import type * as vscode from 'vscode'
import { fromLateSetSource, shareReplay, storeLastValue } from '../../misc/observable'

export type OpenCtxController = Pick<
    Client<vscode.Range>,
    'meta' | 'metaChanges' | 'mentions' | 'mentionsChanges' | 'items'
>

const _openctxController = fromLateSetSource<OpenCtxController>()

export const openctxController: Observable<OpenCtxController> = _openctxController.observable.pipe(
    shareReplay({ shouldCountRefs: false })
)

/**
 * Set the observable that will be used to provide the global {@link openctxController}.
 */
export function setOpenCtxControllerObservable(input: Observable<OpenCtxController>): void {
    _openctxController.setSource(input)
}

const { value: syncValue } = storeLastValue(openctxController)

/**
 * The current OpenCtx controller. Callers should use {@link openctxController} instead so that
 * they react to changes. This function is provided for old call sites that haven't been updated
 * to use an Observable.
 *
 * Callers should take care to avoid race conditions and prefer observing {@link openctxController}.
 *
 * Throws if the OpenCtx controller is not yet set.
 */
export function currentOpenCtxController(): OpenCtxController {
    if (!syncValue.isSet) {
        throw new Error('OpenCtx controller is not initialized')
    }
    return syncValue.last
}

export const REMOTE_REPOSITORY_PROVIDER_URI = 'internal-remote-repository-search'
export const REMOTE_FILE_PROVIDER_URI = 'internal-remote-file-search'
export const REMOTE_DIRECTORY_PROVIDER_URI = 'internal-remote-directory-search'
export const WEB_PROVIDER_URI = 'internal-web-provider'
export const GIT_OPENCTX_PROVIDER_URI = 'internal-git-openctx-provider'
export const CODE_SEARCH_PROVIDER_URI = 'internal-code-search-provider'
export const RULES_PROVIDER_URI = 'internal-rules-provider'
export const MODEL_CONTEXT_PROVIDER_URI = 'internal-model-context-provider'
