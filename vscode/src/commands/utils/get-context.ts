import * as vscode from 'vscode'

import { type ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type CodyCommandContext } from '@sourcegraph/cody-shared/src/commands'

import { VSCodeEditorContext } from '../../editor-context/VSCodeEditorContext'
import { type VSCodeEditor } from '../../editor/vscode-editor'
import { logDebug } from '../../log'
import { extractTestType } from '../prompt/utils'

export const getContextForCommand = async (
    editor: VSCodeEditor,
    promptText: string,
    contextConfig: CodyCommandContext
): Promise<ContextMessage[]> => {
    logDebug('getContextForCommand', 'getting context')
    // Get smart selection if selection is required
    const smartSelection = await editor.getActiveTextEditorSmartSelection()
    const visibleSelection = editor.getActiveTextEditorSelectionOrVisibleContent()
    const selection = smartSelection || visibleSelection

    const editorContext = new VSCodeEditorContext(editor, selection)

    const contextMessages: ContextMessage[] = []

    const workspaceRootUri = editor.getWorkspaceRootUri()
    const isUnitTestRequest = extractTestType(promptText) === 'unit'

    if (contextConfig.none) {
        return []
    }
    if (contextConfig.command && contextConfig.output) {
        contextMessages.push(...editorContext.getTerminalOutputContext(contextConfig.output))
    }
    if (contextConfig.selection !== false) {
        contextMessages.push(...editorContext.getEditorSelectionContext())
    }
    if (contextConfig.currentFile && selection?.fileUri) {
        contextMessages.push(...(await editorContext.getFilePathContext(selection.fileUri)))
    }
    if (contextConfig.filePath) {
        contextMessages.push(...(await editorContext.getFilePathContext(vscode.Uri.file(contextConfig.filePath))))
    }
    if (contextConfig.directoryPath) {
        contextMessages.push(
            ...(await editorContext.getEditorDirContext(contextConfig.directoryPath, selection?.fileUri))
        )
    }
    if (contextConfig.currentDir) {
        contextMessages.push(...(await editorContext.getCurrentDirContext(isUnitTestRequest)))
    }
    if (contextConfig.openTabs) {
        contextMessages.push(...(await editorContext.getEditorOpenTabsContext()))
    }
    // Additional context for unit tests requests
    if (isUnitTestRequest && contextMessages.length < 2) {
        if (selection) {
            contextMessages.push(...(await editorContext.getUnitTestContextMessages(selection, workspaceRootUri)))
        }
    }

    return contextMessages
}
