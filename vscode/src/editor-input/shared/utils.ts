import { type ContextItem, displayPath, type AuthStatus } from '@sourcegraph/cody-shared'
import { ModelProvider } from '@sourcegraph/cody-shared'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { displayLineRange } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import {
    EditorInputTypeToModelType,
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from './constants'
import type { EditorInputType } from './create-input'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'

/**
 * Removes the string after the last '@' character in the given string.
 * Returns the original string if '@' is not found.
 */
export function removeAfterLastAt(str: string): string {
    const lastIndex = str.lastIndexOf('@')
    if (lastIndex === -1) {
        // Return the original string if "@" is not found
        return str
    }
    return str.slice(0, lastIndex)
}

/**
 * Returns a string representation of the given ContextItem for use in UI labels.
 * Includes the file path and an optional range or symbol specifier.
 */
export function getLabelForContextItem(item: ContextItem): string {
    const isFileType = item.type === 'file'
    const rangeLabel = item.range ? `:${displayLineRange(item.range)}` : ''
    if (isFileType) {
        return `${displayPath(item.uri)}${rangeLabel}`
    }
    return `${displayPath(item.uri)}${rangeLabel}#${item.symbolName}`
}

/**
 * Returns the label for the given QuickPickItem, stripping any
 * prefixes used internally to track state.
 */
export function getItemLabel(item: vscode.QuickPickItem) {
    return item.label
        .replace(QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX, '')
        .replace(QUICK_PICK_ITEM_CHECKED_PREFIX, '')
        .trim()
}

export async function fetchDocumentSymbols(
    document: vscode.TextDocument
): Promise<vscode.DocumentSymbol[]> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    )
    if (!symbols) {
        return []
    }

    const flattenSymbols = (symbol: vscode.DocumentSymbol): vscode.DocumentSymbol[] => {
        return [symbol, ...symbol.children.flatMap(flattenSymbols)]
    }

    // Sort all symbols by their start position in the document
    return symbols.flatMap(flattenSymbols).sort((a, b) => a.range.start.compareTo(b.range.start))
}

export function getModelsForUser(authStatus: AuthStatus, type: EditorInputType): ModelProvider[] {
    if (authStatus?.configOverwrites?.chatModel) {
        ModelProvider.add(
            new ModelProvider(authStatus.configOverwrites.chatModel, [
                ModelUsage.Chat,
                // TODO: Add configOverwrites.editModel for separate edit support
                ModelUsage.Edit,
            ])
        )
    }
    return ModelProvider.get(EditorInputTypeToModelType[type].type, authStatus.endpoint)
}

export const GENERIC_EDITOR_INPUT_TITLE = `Cody${!isRunningInsideAgent() ? ' (⌥C)' : ''}`
export const EDIT_EDITOR_INPUT_TITLE = `Cody Edit${!isRunningInsideAgent() ? ' (⌥K)' : ''}`
export const CHAT_EDITOR_INPUT_TITLE = `Cody Chat${!isRunningInsideAgent() ? ' (⌥L)' : ''}`

export function getInputLabels(inputType: EditorInputType): { title: string; placeHolder: string } {
    switch (inputType) {
        case 'Combined':
            return {
                title: GENERIC_EDITOR_INPUT_TITLE,
                placeHolder: 'Enter instruction (@ to include code)',
            }
        case 'Edit':
            return {
                title: EDIT_EDITOR_INPUT_TITLE,
                placeHolder: 'Enter edit instruction (@ to include code)',
            }
        case 'Chat':
            return {
                title: CHAT_EDITOR_INPUT_TITLE,
                placeHolder: 'Enter chat message (@ to include code)',
            }
    }
}
