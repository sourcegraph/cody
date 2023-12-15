import { DocumentContext, getDerivedDocContext } from '../get-current-doc-context'
import { completionPostProcessLogger } from '../post-process-logger'
import { getFirstLine } from '../text-processing'
import { getMatchingSuffixLength } from '../text-processing/process-inline-completions'

import { FetchAndProcessCompletionsParams } from './fetch-and-process-completions'

interface GetUpdatedDocumentContextParams extends FetchAndProcessCompletionsParams {
    completionPostProcessId: string
    initialCompletion: string
}

/**
 * 1. Generates the updated document context pretending like the first line of the completion is already in the document.
 * 2. If the updated document context has the multiline trigger, returns the updated document context.
 * 3. Otherwise, returns the initial document context.
 */
export function getUpdatedDocContext(params: GetUpdatedDocumentContextParams): DocumentContext {
    const { completionPostProcessId, initialCompletion, providerOptions } = params
    const {
        position,
        document,
        docContext,
        docContext: { prefix, suffix, currentLineSuffix },
    } = providerOptions

    const firstLine = getFirstLine(initialCompletion)
    const matchingSuffixLength = getMatchingSuffixLength(firstLine, currentLineSuffix)
    const updatedPosition = position.translate(0, Math.max(firstLine.length - 1, 0))

    completionPostProcessLogger.info({
        completionPostProcessId,
        stage: 'getDerivedDocContext',
        text: initialCompletion,
    })

    const updatedDocContext = getDerivedDocContext({
        languageId: document.languageId,
        position: updatedPosition,
        dynamicMultilineCompletions: true,
        documentDependentContext: {
            prefix: prefix + firstLine,
            // Remove the characters that are being replaced by the completion
            // to reduce the chances of breaking the parse tree with redundant symbols.
            suffix: suffix.slice(matchingSuffixLength),
            injectedPrefix: null,
            completionPostProcessId,
        },
    })

    const isMultilineBasedOnFirstLine = Boolean(updatedDocContext.multilineTrigger)

    if (isMultilineBasedOnFirstLine) {
        completionPostProcessLogger.info({
            completionPostProcessId,
            stage: 'isMultilineBasedOnFirstLine',
            text: initialCompletion,
        })

        return {
            ...docContext,
            completionPostProcessId,
            multilineTrigger: updatedDocContext.multilineTrigger,
            multilineTriggerPosition: updatedDocContext.multilineTriggerPosition,
        }
    }

    return docContext
}
