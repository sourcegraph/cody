import type { Item } from '@openctx/client'
import type { URI } from 'vscode-uri'
import type { RangeData } from '../../common/range'

// TODO(sqs): import from the openctx extension instead of copying here
export interface OpenCtxExtensionAPI {
    /**
     * Get OpenCtx items for the document.
     */
    getItems(doc: { uri: URI; getText(): string }): Promise<Item<RangeData>[] | null>
}
