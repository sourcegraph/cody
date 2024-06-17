import { getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { FixupTask } from '../FixupTask'

export function getLastFullLine(str: string): string {
    const match = str.match(/.*\n(?=.*$)/)

    if (match) {
        return match[0].slice(0, -1)
    }

    return ''
}

export function getVisibleDocument(task: FixupTask): vscode.TextDocument | undefined {
    return vscode.window.visibleTextEditors.find(e => e.document.uri === task.fixupFile.uri)?.document
}

const UNICODE_SPACE = '\u00a0'

export function getTextWithSpaceIndentation(text: string, document: vscode.TextDocument): string {
    const hasTabs = /\t/.test(text)
    if (!hasTabs) {
        // Nothing to do, continue
        return text
    }

    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
    return text.replaceAll(/\t/g, tabAsSpace)
}
