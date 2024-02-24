import dedent from 'dedent'
import type { Position as VSCodePosition, TextDocument as VSCodeTextDocument } from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { type CompletionResponse, testFileUri } from '@sourcegraph/cody-shared'

import { wrapVSCodeTextDocument } from '../testutils/textDocument'

export * from '../tree-sitter/test-helpers'

/**
 * A tag function for creating a {@link CompletionResponse}, for use in tests only.
 *
 * - `├` start of the inline completion to insert
 * - `┤` end of the inline completion to insert
 * - `┴` use for indent placeholder, should be placed at last line after `┤`
 */
export function completion(string: TemplateStringsArray, ...values: unknown[]): CompletionResponse {
    const raw = dedent(string, ...values)
    let completion = raw

    const start = raw.indexOf('├')
    const end = raw.lastIndexOf('┤')
    if (0 <= start && start <= end) {
        completion = raw.slice(start + 1, end)
    }

    return {
        completion,
        stopReason: 'unknown',
    }
}

const CURSOR_MARKER = '█'

export function document(
    text: string,
    languageId = 'typescript',
    uriString = testFileUri('test.ts').toString()
): VSCodeTextDocument {
    return wrapVSCodeTextDocument(TextDocument.create(uriString, languageId, 0, text))
}

export function documentAndPosition(
    textWithCursor: string,
    languageId?: string,
    uriString?: string
): { document: VSCodeTextDocument; position: VSCodePosition } {
    const cursorIndex = textWithCursor.indexOf(CURSOR_MARKER)
    if (cursorIndex === -1) {
        throw new Error(`The test text must include a ${CURSOR_MARKER} to denote the cursor position.`)
    }
    const prefix = textWithCursor.slice(0, cursorIndex)
    const suffix = textWithCursor.slice(cursorIndex + CURSOR_MARKER.length)
    const doc = document(prefix + suffix, languageId, uriString)
    const position = doc.positionAt(cursorIndex)
    return { document: doc, position }
}

export function nextTick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
}
