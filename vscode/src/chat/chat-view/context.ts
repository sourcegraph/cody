import * as vscode from 'vscode'

import {
    type ContextItem,
    ContextItemSource,
    type PromptString,
    type Result,
    isAbortError,
    isFileURI,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../output-channel-logger'

export interface HumanInput {
    text: PromptString
    mentions: ContextItem[]
}

/**
 * Uses symf to conduct a local search within the current workspace folder
 */
export async function searchSymf(
    symf: SymfRunner | null,
    editor: VSCodeEditor,
    workspaceRoot: vscode.Uri,
    userText: PromptString,
    blockOnIndex = false
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.symf', async () => {
        if (!symf) {
            return []
        }
        if (!isFileURI(workspaceRoot)) {
            return []
        }

        const indexExists = await symf.getIndexStatus(workspaceRoot)
        if (indexExists !== 'ready' && !blockOnIndex) {
            void symf.ensureIndex(workspaceRoot, {
                retryIfLastAttemptFailed: false,
                ignoreExisting: false,
            })
            return []
        }

        // trigger background reindex if the index is stale
        void symf?.reindexIfStale(workspaceRoot)

        const r0 = (await symf.getResults(userText, [workspaceRoot])).flatMap(async results => {
            const items = (await results).flatMap(
                async (result: Result): Promise<ContextItem[] | ContextItem> => {
                    const range = new vscode.Range(
                        result.range.startPoint.row,
                        result.range.startPoint.col,
                        result.range.endPoint.row,
                        result.range.endPoint.col
                    )

                    let text: string | undefined
                    try {
                        text = await editor.getTextEditorContentForFile(result.file, range)
                        text = truncateSymfResult(text)
                    } catch (error) {
                        logError('ChatController.searchSymf', `Error getting file contents: ${error}`)
                        return []
                    }

                    const metadata: string[] = [
                        'source:symf-index',
                        'score:' + result.blugeScore.toFixed(0),
                    ]
                    if (result.heuristicBoostID) {
                        metadata.push('boost:' + result.heuristicBoostID)
                    }
                    return {
                        type: 'file',
                        uri: result.file,
                        range,
                        source: ContextItemSource.Search,
                        content: text,
                        metadata,
                    }
                }
            )
            return (await Promise.all(items)).flat()
        })

        return (await Promise.all(r0)).flat()
    })
}

export async function retrieveContextGracefully<T>(
    promise: Promise<T[]>,
    strategy: string
): Promise<T[]> {
    try {
        logDebug('ChatController', `resolveContext > ${strategy} (start)`)
        return await promise
    } catch (error) {
        if (isAbortError(error)) {
            logError('ChatController', `resolveContext > ${strategy}' (aborted)`)
            throw error
        }
        logError('ChatController', `resolveContext > ${strategy} (error)`, error)
        return []
    } finally {
        logDebug('ChatController', `resolveContext > ${strategy} (end)`)
    }
}

const maxSymfBytes = 2_048
export function truncateSymfResult(text: string): string {
    if (text.length >= maxSymfBytes) {
        text = text.slice(0, maxSymfBytes)
        const j = text.lastIndexOf('\n')
        if (j !== -1) {
            text = text.slice(0, j)
        }
    }
    return text
}
