import type { ContextItem } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { getFileContextFiles, getSymbolContextFiles } from '../../editor/utils/editor-context'
import { getLabelForContextItem } from './utils'

/* Match strings that end with a '@' followed by any characters except a space */
const MATCHING_CONTEXT_FILE_REGEX = /@(\S+)$/

/* Match strings that end with a '@#' followed by any characters except a space */
const MATCHING_SYMBOL_REGEX = /@#(\S+)$/

const MAX_FUZZY_RESULTS = 20

interface FixupMatchingContext {
    /* Unique identifier for the context, shown in the input value but not necessarily in the quick pick selector */
    key: string
    /* If present, will override the key shown in the quick pick selector */
    shortLabel?: string
    file: ContextItem
}

export async function getMatchingContext(instruction: string): Promise<FixupMatchingContext[] | null> {
    const symbolMatch = instruction.match(MATCHING_SYMBOL_REGEX)
    if (symbolMatch) {
        const symbolResults = await getSymbolContextFiles(symbolMatch[1], MAX_FUZZY_RESULTS)
        return symbolResults.map(result => ({
            key: getLabelForContextItem(result),
            file: result,
            shortLabel: `${result.kind === 'class' ? '$(symbol-structure)' : '$(symbol-method)'} ${
                result.symbolName
            }`,
        }))
    }

    const fileMatch = instruction.match(MATCHING_CONTEXT_FILE_REGEX)
    if (fileMatch) {
        const cancellation = new vscode.CancellationTokenSource()
        const fileResults = await getFileContextFiles(
            fileMatch[1],
            MAX_FUZZY_RESULTS,
            cancellation.token
        )
        return fileResults.map(result => ({
            key: getLabelForContextItem(result),
            file: result,
        }))
    }

    return null
}
