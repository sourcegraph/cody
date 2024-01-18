import * as vscode from 'vscode'

import { type CodeBlockMeta } from '@sourcegraph/cody-ui/src/chat/CodeBlocks'

import { getEditor } from '../../editor/active-editor'
import { telemetryService } from '../telemetry'
import { telemetryRecorder } from '../telemetry-v2'

import { countCode, matchCodeSnippets } from './code-count'

/**
 * It tracks the last stored code snippet and metadata like lines, chars, event, source etc.
 * This is used to track acceptance of generated code by Cody for Chat and Commands
 */
let lastStoredCode = { code: 'init', lineCount: 0, charCount: 0, eventName: '', source: '', requestID: '' }
let insertInProgress = false
let lastClipboardText = ''

/**
 * Sets the last stored code snippet and associated metadata.
 *
 * This is used to track code generation events in VS Code.
 */
function setLastStoredCode(
    code: string,
    eventName: string,
    source = 'chat',
    requestID = ''
): { code: string; lineCount: number; charCount: number; eventName: string; source?: string; requestID?: string } {
    // All non-copy events are considered as insertions since we don't need to listen for paste events
    insertInProgress = !eventName.includes('copy')
    const { lineCount, charCount } = countCode(code)
    const codeCount = { code, lineCount, charCount, eventName, source, requestID }

    lastStoredCode = codeCount

    // Currently supported events are: copy, insert, save
    const op = eventName.includes('copy') ? 'copy' : eventName.startsWith('insert') ? 'insert' : 'save'
    const args = { op, charCount, lineCount, source, requestID }

    telemetryService.log(`CodyVSCodeExtension:${eventName}:clicked`, { args, hasV2Event: true })
    telemetryRecorder.recordEvent(`cody.${eventName}`, 'clicked', {
        metadata: {
            lineCount,
            charCount,
        },
        interactionID: requestID,
        privateMetadata: {
            source,
            op,
        },
    })

    return codeCount
}

async function setLastTextFromClipboard(clipboardText?: string): Promise<void> {
    lastClipboardText = clipboardText || (await vscode.env.clipboard.readText())
}

/**
 * Handles insert event to insert text from code block at cursor position
 * Replace selection if there is one and then log insert event
 * Note: Using workspaceEdit instead of 'editor.action.insertSnippet' as the later reformats the text incorrectly
 */
export async function handleCodeFromInsertAtCursor(text: string, meta?: CodeBlockMeta): Promise<void> {
    const editor = getEditor()
    const activeEditor = editor.active
    const selectionRange = activeEditor?.selection
    if (!activeEditor || !selectionRange) {
        throw new Error('No editor or selection found to insert text')
    }

    const edit = new vscode.WorkspaceEdit()
    // trimEnd() to remove new line added by Cody
    edit.insert(activeEditor.document.uri, selectionRange.start, text + '\n')
    await vscode.workspace.applyEdit(edit)

    // Log insert event
    const op = 'insert'
    const eventName = op + 'Button'
    setLastStoredCode(text, eventName, meta?.source, meta?.requestID)
}

/**
 * Handles insert event to insert text from code block to new file
 */
export function handleCodeFromSaveToNewFile(text: string, meta?: CodeBlockMeta): void {
    const eventName = 'saveButton'
    setLastStoredCode(text, eventName, meta?.source, meta?.requestID)
}

/**
 * Handles copying code and detecting a paste event.
 */
export async function handleCopiedCode(text: string, isButtonClickEvent: boolean, meta?: CodeBlockMeta): Promise<void> {
    // If it's a Button event, then the text is already passed in from the whole code block
    const copiedCode = isButtonClickEvent ? text : await vscode.env.clipboard.readText()
    const eventName = isButtonClickEvent ? 'copyButton' : 'keyDown:Copy'
    // Set for tracking
    if (copiedCode) {
        setLastStoredCode(copiedCode, eventName, meta?.source, meta?.requestID)
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
        // e.g.'CodyVSCodeExtension:keyDown:Paste:clicked'
        telemetryService.log(`CodyVSCodeExtension:${eventType}:Paste:clicked`, {
            op,
            lineCount,
            charCount,
            source,
            requestID,
            hasV2Event: true,
        })

        telemetryRecorder.recordEvent(`cody.${eventType}`, 'paste', {
            metadata: {
                lineCount,
                charCount,
            },
            interactionID: requestID,
            privateMetadata: {
                source,
                op,
            },
        })
    }
}
