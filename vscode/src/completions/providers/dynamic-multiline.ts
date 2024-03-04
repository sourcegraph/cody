import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'
import { type DocumentContext, insertIntoDocContext } from '../get-current-doc-context'
import { getFirstLine } from '../text-processing'

interface GetUpdatedDocumentContextParams {
    insertText: string
    languageId: string
    docContext: DocumentContext
}

/**
 * 1. Generates the object with `multilineTrigger` and `multilineTriggerPosition` fields pretending like the first line of the completion is already in the document.
 * 2. If the updated document context has the multiline trigger, returns the generated object
 * 3. Otherwise, returns an empty object.
 */
export function getDynamicMultilineDocContext(
    params: GetUpdatedDocumentContextParams
): Pick<DocumentContext, 'multilineTrigger' | 'multilineTriggerPosition'> | undefined {
    const { insertText, languageId, docContext } = params

    const updatedDocContext = insertIntoDocContext({
        languageId,
        insertText: getFirstLine(insertText),
        dynamicMultilineCompletions: true,
        docContext,
    })

    const isMultilineBasedOnFirstLine = Boolean(updatedDocContext.multilineTrigger)

    if (isMultilineBasedOnFirstLine) {
        addAutocompleteDebugEvent('isMultilineBasedOnFirstLine', {
            currentLinePrefix: docContext.currentLinePrefix,
            text: insertText,
        })

        return {
            multilineTrigger: updatedDocContext.multilineTrigger,
            multilineTriggerPosition: updatedDocContext.multilineTriggerPosition,
        }
    }

    return undefined
}
