import type { Annotation, Item, ItemsParams } from '@openctx/client'
import type { TextDocument } from 'vscode'
import type { RangeData } from '../../common/range'

// TODO(sqs): import from the openctx extension instead of copying here
export interface OpenCtxExtensionAPI {
    /**
     * Get OpenCtx items for the document.
     */
    getItems(params: ItemsParams): Promise<Item[] | null>

    /**
     * Get OpenCtx annotations for the document.
     */
    getAnnotations(doc: Pick<TextDocument, 'uri' | 'getText'>): Promise<Annotation<RangeData>[] | null>
}
