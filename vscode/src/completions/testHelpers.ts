import dedent from 'dedent'
import type { Position as VSCodePosition, TextDocument as VSCodeTextDocument } from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { wrapVSCodeTextDocument } from '../testutils/textDocument'

/**
 * A tag function for creating a {@link CompletionResponse}, for use in tests only.
 *
 * - `├` start of the inline completion to insert
 * - `┤` end of the inline completion to insert
 * - `┴` use for indent placeholder, should be placed at last line after `┤`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function completion(string: TemplateStringsArray, ...values: any): CompletionResponse {
    const raw = dedent(string, ...values)
    let completion = raw

    const start = raw.indexOf('├')
    const end = raw.lastIndexOf('┤')

    // eslint-disable-next-line yoda
    if (0 <= start && start <= end) {
        completion = raw.slice(start + 1, end)
    }

    return {
        completion,
        stopReason: 'unknown',
    }
}

const CURSOR_MARKER = '█'

export function documentAndPosition(
    textWithCursor: string,
    languageId = 'typescript',
    uriString = 'file:///test.ts'
): { document: VSCodeTextDocument; position: VSCodePosition } {
    const cursorIndex = textWithCursor.indexOf(CURSOR_MARKER)
    if (cursorIndex === -1) {
        throw new Error(`The test text must include a ${CURSOR_MARKER} to denote the cursor position.`)
    }
    const prefix = textWithCursor.slice(0, cursorIndex)
    const suffix = textWithCursor.slice(cursorIndex + CURSOR_MARKER.length)
    const codeWithoutCursor = prefix + suffix
    const document = wrapVSCodeTextDocument(TextDocument.create(uriString, languageId, 0, codeWithoutCursor))
    const position = document.positionAt(cursorIndex)
    return { document, position }
}
