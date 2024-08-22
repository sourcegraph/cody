import * as vscode from 'vscode'

import {
    type AuthStatus,
    type EditModel,
    PromptString,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
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
        case 'keyDown.Copy':
            operation = 'copy'
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

function getSmartApplyModel(authStatus: AuthStatus): EditModel | undefined {
    if (!authStatus.isDotCom) {
        // We cannot be sure what model we're using for enterprise, we will let this fall through
        // to the default edit/smart apply behaviour where we use the configured enterprise model.
        return
    }

    /**
     * For PLG, we have a greater model choice. We default this to Claude 3.5 Sonnet
     * as it is the most reliable model for smart apply from our testing.
     * Right now we should prioritise reliability over latency, take this into account before changing
     * this value.
     */
    return 'anthropic/claude-3-5-sonnet-20240620'
}

export async function handleSmartApply(
    id: string,
    code: string,
    authStatus: AuthStatus,
    instruction?: string | null,
    fileUri?: string | null
): Promise<void> {
    const activeEditor = getEditor()?.active
    const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri
    const uri =
        fileUri && workspaceUri ? Utils.joinPath(workspaceUri, fileUri) : activeEditor?.document.uri

    const isNewFile = uri && !(await doesFileExist(uri))
    if (isNewFile) {
        const workspaceEditor = new vscode.WorkspaceEdit()
        workspaceEditor.createFile(uri, { ignoreIfExists: false })
        await vscode.workspace.applyEdit(workspaceEditor)
    }

    const document = uri ? await vscode.workspace.openTextDocument(uri) : activeEditor?.document
    if (!document) {
        throw new Error('No editor found to insert text')
    }

    const visibleEditor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri.toString() === document.uri.toString()
    )

    // Open the document for the user, so they can immediately see the progress decorations
    await vscode.window.showTextDocument(document, {
        // We may have triggered the smart apply from a different view column to the visible document
        // so re-use the correct view column if we can
        viewColumn: visibleEditor?.viewColumn,
    })

    setLastStoredCode(code, 'applyButton')
    await executeSmartApply({
        configuration: {
            id,
            document,
            instruction: PromptString.unsafe_fromUserQuery(instruction || ''),
            model: getSmartApplyModel(authStatus),
            replacement: code,
            isNewFile,
        },
        source: 'chat',
    })
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
