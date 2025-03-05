import {
    BotResponseMultiplexer,
    type ChatClient,
    type EditModel,
    type PromptString,
    modelsService,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { SmartApplyResult } from '../../../chat/protocol'
import type { FixupTaskID } from '../../../non-stop/FixupTask'
import { CodyTaskState } from '../../../non-stop/state'
import { fuzzyFindLocation } from '../../../supercompletions/utils/fuzzy-find-location'
import { SMART_APPLY_MODEL_IDENTIFIERS } from '../constants'
import { SMART_APPLY_TOPICS, type SmartApplySelectionProvider } from './selection/base'
import { CustomModelSelectionProvider } from './selection/custom-model'
import { DefaultSelectionProvider } from './selection/default'

async function promptModelForOriginalCode(
    selectionProvider: SmartApplySelectionProvider,
    instruction: PromptString,
    replacement: PromptString,
    document: vscode.TextDocument,
    model: EditModel,
    client: ChatClient,
    codyApiVersion: number
): Promise<string> {
    const multiplexer = new BotResponseMultiplexer()

    let text = ''
    multiplexer.sub(SMART_APPLY_TOPICS.REPLACE.toString(), {
        onResponse: async (content: string) => {
            text += content
        },
        onTurnComplete: async () => {
            Promise.resolve(text)
        },
    })

    const abortController = new AbortController()
    const { prefix, messages } = await selectionProvider.getPrompt({
        instruction,
        replacement,
        document,
        model,
        codyApiVersion,
    })
    const params = selectionProvider.getLLMCompletionsParameters()
    const stream = await client.chat(messages, params, abortController.signal)

    let textConsumed = 0
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                if (textConsumed === 0 && prefix) {
                    void multiplexer.publish(prefix)
                }
                const text = message.text.slice(textConsumed)
                textConsumed += text.length
                void multiplexer.publish(text)
                break
            }
            case 'complete': {
                await multiplexer.notifyTurnComplete()
                break
            }
            case 'error': {
                throw message.error
            }
        }
    }

    return text
}

function getFullRangeofDocument(document: vscode.TextDocument): vscode.Range {
    const endOfDocument = document.lineCount - 1
    const lastLine = document.lineAt(endOfDocument)
    const range = new vscode.Range(0, 0, endOfDocument, lastLine.range.end.character)
    return range
}

export type SmartApplySelectionType = 'insert' | 'selection' | 'entire-file'

interface SmartApplySelection {
    type: SmartApplySelectionType
    range: vscode.Range
}

function getSmartApplySelectionProvider(
    model: string,
    replacement: PromptString
): SmartApplySelectionProvider {
    const contextWindow = modelsService.getContextWindowByID(model)
    if (Object.values(SMART_APPLY_MODEL_IDENTIFIERS).includes(model)) {
        return new CustomModelSelectionProvider(model, contextWindow, replacement.toString())
    }
    return new DefaultSelectionProvider(model, contextWindow)
}

export async function getSmartApplySelection({
    id,
    instruction,
    replacement,
    document,
    model,
    chatClient,
    codyApiVersion,
}: {
    id: FixupTaskID
    instruction: PromptString
    replacement: PromptString
    document: vscode.TextDocument
    model: EditModel
    chatClient: ChatClient
    codyApiVersion: number
}): Promise<SmartApplySelection | null> {
    let originalCode: string
    const selectionProvider = getSmartApplySelectionProvider(model, replacement)
    try {
        originalCode = await promptModelForOriginalCode(
            selectionProvider,
            instruction,
            replacement,
            document,
            model,
            chatClient,
            codyApiVersion
        )
    } catch (error: unknown) {
        // We erred when asking the LLM to produce the original code.
        // Surface this error back to the user
        vscode.window.showErrorMessage(
            `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`
        )

        // Notify the WebView that the Smart Apply failed
        await vscode.commands.executeCommand('cody.command.markSmartApplyApplied', {
            taskId: id,
            taskState: CodyTaskState.Error,
        } satisfies SmartApplyResult)

        return null
    }

    if (originalCode.trim().length === 0 || originalCode.trim() === 'INSERT') {
        // Insert flow. Cody thinks that this code should be inserted into the document.
        // Add the code to the end position of the document.
        const range = getFullRangeofDocument(document)
        return {
            type: 'insert',
            range: new vscode.Range(range.end, range.end),
        }
    }

    if (originalCode.trim() === 'ENTIRE_FILE') {
        // Replace flow. Cody thinks that the entire file should be replaced.
        // Replace the entire file.
        // Note: This is essentially a shortcut for a common use case,
        // we don't want Cody to repeat the entire file if we can avoid it.
        const range = new vscode.Range(0, 0, document.lineCount - 1, 0)
        return {
            type: 'entire-file',
            range,
        }
    }

    const fuzzyLocation = fuzzyFindLocation(document, originalCode)
    if (!fuzzyLocation) {
        // Cody told us we need to replace some code, but we couldn't find where to replace it
        return null
    }

    if (
        fuzzyLocation.location.range.isEmpty ||
        document.getText(fuzzyLocation.location.range).trim() === ''
    ) {
        // Cody returned a selection, but it was empty. We ensure that we treat this as an 'insert'
        // rather than a 'selection' and replace.
        return {
            type: 'insert',
            range: new vscode.Range(fuzzyLocation.location.range.end, fuzzyLocation.location.range.end),
        }
    }

    // We found a matching selection in the text, let's use this!
    return {
        type: 'selection',
        range: fuzzyLocation.location.range,
    }
}

export const SMART_APPLY_FILE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.unchangedCodeBackground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})
