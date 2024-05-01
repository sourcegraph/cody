import type { Annotation, ItemsParams, ItemsResult } from '@openctx/client'
import type { TextDocument } from 'vscode'
import type { RangeData } from '../../common/range'

/**
 * Copied from OpenCtx's VS Code extension sources.
 */
export interface OpenCtxExtensionAPI {
    /**
     * Get OpenCtx items for the document.
     */
    getItems(params: ItemsParams): Promise<ItemsResult | null>

    /**
     * Get OpenCtx annotations for the document.
     */
    getAnnotations(doc: Pick<TextDocument, 'uri' | 'getText'>): Promise<Annotation<RangeData>[] | null>
}
