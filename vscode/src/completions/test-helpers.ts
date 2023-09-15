import path from 'path'

import dedent from 'dedent'
import type { Position as VSCodePosition, TextDocument as VSCodeTextDocument } from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'
import Parser, { QueryCapture, QueryMatch } from 'web-tree-sitter'

import { ROOT_PATH } from '@sourcegraph/cody-shared/src/common/paths'
import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { wrapVSCodeTextDocument } from '../testutils/textDocument'

import { SupportedLanguage } from './tree-sitter/grammars'
import { createParser } from './tree-sitter/parser'

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

export const CUSTOM_WASM_LANGUAGE_DIR = path.resolve(ROOT_PATH, 'vscode/resources/wasm')

export function initTreeSitterParser(language = SupportedLanguage.TypeScript): Promise<Parser> {
    return createParser({
        language,
        grammarDirectory: CUSTOM_WASM_LANGUAGE_DIR,
    })
}

interface FormattedMatch {
    pattern: number
    captures: FormattedCapture[]
}

export function formatMatches(matches: QueryMatch[]): FormattedMatch[] {
    return matches.map(({ pattern, captures }) => ({
        pattern,
        captures: formatCaptures(captures),
    }))
}

interface FormattedCapture {
    name: string
    text: string
}

export function formatCaptures(captures: QueryCapture[]): FormattedCapture[] {
    return captures.map(capture => ({
        name: capture.name,
        text: capture.node.text,
    }))
}

export async function nextTick(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0))
}
