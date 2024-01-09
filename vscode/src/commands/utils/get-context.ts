import * as vscode from 'vscode'

import { type ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { type CodyCommand } from '@sourcegraph/cody-shared/src/commands'

import { doesFileExist } from '../../editor-context/helpers'
import { VSCodeEditorContext } from '../../editor-context/VSCodeEditorContext'
import { type VSCodeEditor } from '../../editor/vscode-editor'
import { logDebug } from '../../log'
import { NewFixupFileMap } from '../../non-stop/FixupFile'
import { extractTestType } from '../prompt/utils'

import { convertFsPathToTestFile } from './new-test-file'

export const getContextForCommand = async (editor: VSCodeEditor, command: CodyCommand): Promise<ContextMessage[]> => {
    logDebug('getContextForCommand', 'getting context')
    const contextConfig = command.context || { codebase: false }
    // Get smart selection if selection is required
    const smartSelection = await editor.getActiveTextEditorSmartSelection()
    const visibleSelection = editor.getActiveTextEditorSelectionOrVisibleContent()
    const selection = smartSelection || visibleSelection

    const editorContext = new VSCodeEditorContext(editor, selection)

    const contextMessages: ContextMessage[] = []

    const workspaceRootUri = editor.getWorkspaceRootUri()
    const isUnitTestRequest = extractTestType(command.prompt) === 'unit'

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
        contextMessages.push(...(await editorContext.getFilePathContext(selection?.fileUri?.fsPath)))
    }
    if (contextConfig.filePath) {
        contextMessages.push(...(await editorContext.getFilePathContext(contextConfig.filePath)))
    }
    if (contextConfig.directoryPath) {
        contextMessages.push(
            ...(await editorContext.getEditorDirContext(contextConfig.directoryPath, selection?.fileName))
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
        if (selection?.fileName) {
            contextMessages.push(...(await editorContext.getUnitTestContextMessages(selection, workspaceRootUri)))
        }
    }

    // Add the newly generated test file uri to the fixup file map with the task id
    if (isUnitTestRequest && smartSelection?.fileUri && command.fixup?.taskID) {
        const codebaseTestFile = contextMessages.find(m => m.file?.fileName.includes('test'))?.file?.fileName
        if (codebaseTestFile) {
            const testFsPath = convertFsPathToTestFile(smartSelection?.fileUri.fsPath, codebaseTestFile)
            const isFileExists = await doesFileExist(vscode.Uri.file(testFsPath))
            const docUri = vscode.Uri.parse(isFileExists ? testFsPath : `untitled:${testFsPath}`)
            NewFixupFileMap.set(command.fixup?.taskID, docUri)
        }
    }

    return contextMessages
}
