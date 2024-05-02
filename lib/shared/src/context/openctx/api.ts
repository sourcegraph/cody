import type { Annotation, ItemsParams, ItemsResult } from '@openctx/client'
import type { TextDocument } from 'vscode'
import type { RangeData } from '../../common/range'

/**
 * Copied from OpenCtx's VS Code extension sources.
 */
export interface OpenCtxExtensionAPI {
    getItems(params: ItemsParams): Promise<ItemsResult | null>
    getAnnotations(doc: Pick<TextDocument, 'uri' | 'getText'>): Promise<Annotation<RangeData>[] | null>
}

let _getAPI: (() => Promise<OpenCtxExtensionAPI | null>) | undefined

/**
 * Set the handle to the OpenCtx extension API (e.g., from
 * `vscode.extensions.getExtension('sourcegraph.openctx')`).
 */
export function setOpenCtxExtensionAPI(getAPI: () => Promise<OpenCtxExtensionAPI | null>): void {
    if (_getAPI) {
        throw new Error('OpenCtx extension API is already set')
    }
    _getAPI = getAPI
}

let _api: Promise<OpenCtxExtensionAPI | null> | undefined

/**
 * Get a handle to the OpenCtx extension API, set in {@link setOpenCtxExtensionAPI}.
 */
export function getOpenCtxExtensionAPI(): Promise<OpenCtxExtensionAPI | null | undefined> {
    if (!_getAPI) {
        return Promise.resolve(undefined)
    }
    if (!_api) {
        _api = _getAPI()
    }
    return _api
}
