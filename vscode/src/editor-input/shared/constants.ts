import * as vscode from 'vscode'
import type { EditorInputType } from './create-input'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { chatModel, editModel } from '../../models'

export const FILE_HELP_LABEL = 'Search for a file to include, or type # to search symbols...'
export const SYMBOL_HELP_LABEL = 'Search for a symbol to include...'
export const OTHER_MENTION_HELP_LABEL = 'Search for context to include...'
export const NO_MATCHES_LABEL = 'No matches found'

export const QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX = '\u00A0\u00A0\u00A0\u00A0\u00A0'
export const QUICK_PICK_ITEM_CHECKED_PREFIX = '$(check)'

export const PREVIEW_RANGE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    borderWidth: '3px',
    borderStyle: 'solid',
})

export const EditorInputTypeToModelType: Record<
    EditorInputType,
    { type: ModelUsage; accessor: typeof chatModel | typeof editModel }
> = {
    Combined: {
        type: ModelUsage.Edit,
        accessor: chatModel,
    },
    Chat: {
        type: ModelUsage.Chat,
        accessor: chatModel,
    },
    Edit: {
        type: ModelUsage.Edit,
        accessor: editModel,
    },
}
