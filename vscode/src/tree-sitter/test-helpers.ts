import path from 'path'

import Parser, { QueryCapture, QueryMatch } from 'web-tree-sitter'

import { ROOT_PATH } from '@sourcegraph/cody-shared/src/common/paths'

import { SupportedLanguage } from './grammars'
import { createParser } from './parser'
import { DocumentQuerySDK, getDocumentQuerySDK } from './query-sdk'

export const CUSTOM_WASM_LANGUAGE_DIR = path.resolve(ROOT_PATH, 'vscode/resources/wasm')

/**
 * Should be used in tests only.
 */
export function initTreeSitterParser(language = SupportedLanguage.TypeScript): Promise<Parser> {
    return createParser({
        language,
        grammarDirectory: CUSTOM_WASM_LANGUAGE_DIR,
    })
}

/**
 * Should be used in tests only.
 */
export async function initTreeSitterSDK(language = SupportedLanguage.TypeScript): Promise<DocumentQuerySDK> {
    await initTreeSitterParser(language)
    const sdk = getDocumentQuerySDK(language)

    if (!sdk) {
        throw new Error('Document query SDK is not initialized')
    }

    return sdk
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
        start: capture.node.startPosition,
        end: capture.node.endPosition,
    }))
}
