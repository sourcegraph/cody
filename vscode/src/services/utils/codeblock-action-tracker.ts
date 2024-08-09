import * as vscode from 'vscode'

import { PromptString, telemetryRecorder } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'

import { Utils } from 'vscode-uri'
import { doesFileExist } from '../../commands/utils/workspace-files'
import { executeSmartApply } from '../../edit/smart-apply'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import { countCode, matchCodeSnippets } from './code-count'

/**
 * It tracks the last stored code snippet and metadata like lines, chars, event, source etc.
 * This is used to track acceptance of generated code by Cody for Chat and Commands
 */
let lastStoredCode = {
    code: 'init',
    lineCount: 0,
    charCount: 0,
    eventName: '',
    source: '',
    requestID: '',
}
let insertInProgress = false
let lastClipboardText = ''

/**
 * SourceMetadataMapping is used to map the source to a numerical value, so telemetry can be recorded on `metadata`.
 **/
enum SourceMetadataMapping {
    chat = 1,
}

/**
 * Sets the last stored code snippet and associated metadata.
 *
 * This is used to track code generation events in VS Code.
 */
function setLastStoredCode(
    code: string,
    eventName: 'copyButton' | 'keyDown.Copy' | 'applyButton' | 'insertButton' | 'saveButton',
    source = 'chat',
    requestID = ''
): void {
    // All non-copy events are considered as insertions since we don't need to listen for paste events
    insertInProgress = !eventName.includes('copy')
    const { lineCount, charCount } = countCode(code)
    const codeCount = { code, lineCount, charCount, eventName, source, requestID }

    lastStoredCode = codeCount

    let operation: string
    switch (eventName) {
        case 'copyButton':
            operation = 'copy'
            break
        case 'keyDown.Copy':
            operation = 'paste'
            break
        case 'applyButton':
            operation = 'apply'
            break
        case 'insertButton':
            operation = 'insert'
            break
        case 'saveButton':
            operation = 'save'
            break
    }

    telemetryRecorder.recordEvent(`cody.${eventName}`, 'clicked', {
        metadata: {
            source: SourceMetadataMapping[source as keyof typeof SourceMetadataMapping] || 0, // Use 0 as default if source is not found
            lineCount,
            charCount,
        },
        interactionID: requestID,
        privateMetadata: {
            source,
            op: operation,
        },
    })
}

async function setLastTextFromClipboard(clipboardText?: string): Promise<void> {
    lastClipboardText = clipboardText || (await vscode.env.clipboard.readText())
}

/**
 * Handles insert event to insert text from code block at cursor position
 * Replace selection if there is one and then log insert event
 * Note: Using workspaceEdit instead of 'editor.action.insertSnippet' as the later reformats the text incorrectly
 */
export async function handleCodeFromInsertAtCursor(text: string): Promise<void> {
    const editor = getEditor()
    const activeEditor = editor.active
    const selectionRange = activeEditor?.selection
    if (!activeEditor || !selectionRange) {
        throw new Error('No editor or selection found to insert text')
    }

    const edit = new vscode.WorkspaceEdit()
    // trimEnd() to remove new line added by Cody
    edit.insert(activeEditor.document.uri, selectionRange.start, `${text}\n`)
    setLastStoredCode(text, 'insertButton')
    await vscode.workspace.applyEdit(edit)
}

export async function handleSmartApply(
    code: string,
    instruction?: string | null,
    fileUri?: string | null
): Promise<void> {
    const activeEditor = getEditor()?.active
    const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri
    const uri =
        fileUri && workspaceUri ? Utils.joinPath(workspaceUri, fileUri) : activeEditor?.document.uri

    if (uri && !(await doesFileExist(uri))) {
        return handleNewFileWithCode(code, uri)
    }

    const document = uri ? await vscode.workspace.openTextDocument(uri) : activeEditor?.document
    const editor = document && (await vscode.window.showTextDocument(document))
    if (!editor || !document) {
        throw new Error('No editor found to insert text')
    }

    setLastStoredCode(code, 'applyButton')
    /**
     * TODO: We currently only support 3.5 Sonnet for Smart Apply.
     * This is because it is the most reliable way to apply these changes to files.
     * We should also support OpenAI models and update the prompt to ensure we get reliable results.
     * We will need this for enterprise.
     */
    const DEFAULT_MODEL = 'anthropic/claude-3-5-sonnet-20240620'
    await executeSmartApply({
        configuration: {
            document: editor.document,
            instruction: PromptString.unsafe_fromUserQuery(instruction || ''),
            model: DEFAULT_MODEL,
            replacement: code,
        },
        source: 'chat',
    })
}

export async function handleNewFileWithCode(code: string, uri: vscode.Uri): Promise<void> {
    const workspaceEditor = new vscode.WorkspaceEdit()
    workspaceEditor.createFile(uri, { ignoreIfExists: false })
    const range = new vscode.Range(0, 0, 0, 0)
    workspaceEditor.replace(uri, range, code.trimEnd())
    setLastStoredCode(code, 'applyButton')
    await vscode.workspace.applyEdit(workspaceEditor)
    return vscode.commands.executeCommand('vscode.open', uri)
}

/**
 * Handles insert event to insert text from code block to new file
 */
export async function handleCodeFromSaveToNewFile(text: string, editor: VSCodeEditor): Promise<void> {
    setLastStoredCode(text, 'saveButton')
    return editor.createWorkspaceFile(text)
}

/**
 * Handles copying code and detecting a paste event.
 */
export async function handleCopiedCode(text: string, isButtonClickEvent: boolean): Promise<void> {
    // If it's a Button event, then the text is already passed in from the whole code block
    const copiedCode = isButtonClickEvent ? text : await vscode.env.clipboard.readText()
    const eventName = isButtonClickEvent ? 'copyButton' : 'keyDown.Copy'
    // Set for tracking
    if (copiedCode) {
        setLastStoredCode(copiedCode, eventName)
    }
}

// For tracking paste events for inline-chat
export async function onTextDocumentChange(newCode: string): Promise<void> {
    const { code, lineCount, charCount, source, requestID } = lastStoredCode

    if (!code) {
        return
    }

    if (insertInProgress) {
        insertInProgress = false
        return
    }

    await setLastTextFromClipboard()

    // the copied code should be the same as the clipboard text
    if (matchCodeSnippets(code, lastClipboardText) && matchCodeSnippets(code, newCode)) {
        const op = 'paste'
        const eventType = 'keyDown'

        telemetryRecorder.recordEvent(`cody.${eventType}`, 'paste', {
            metadata: {
                lineCount,
                charCount,
                source: SourceMetadataMapping[source as keyof typeof SourceMetadataMapping] || 0, // Use 0 as default if source is not found
            },
            interactionID: requestID,
            privateMetadata: {
                source,
                op,
            },
        })
    }
}
