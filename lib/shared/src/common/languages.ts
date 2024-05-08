import type { URI } from 'vscode-uri'

import { uriExtname } from './uri'

/**
 * Programming languages that we treat specially. Add to this (and {@link languageFromFilename} as
 * needed).
 *
 * This is not an enum because {@link languageFromFilename} needs to sometimes return un-typed
 * values (for unrecognized languages).
 */
export const ProgrammingLanguage = {
    JavaScript: 'JavaScript',
    TypeScript: 'TypeScript',
    Python: 'Python',
    Java: 'Java',
    Go: 'Go',
    Markdown: 'Markdown',
    PlainText: 'Plain text',
}

const EXTENSION_TO_LANGUAGE: { [key: string]: string } = {
    js: ProgrammingLanguage.JavaScript,
    jsx: ProgrammingLanguage.JavaScript,
    cjs: ProgrammingLanguage.JavaScript,
    mjs: ProgrammingLanguage.JavaScript,
    ts: ProgrammingLanguage.TypeScript,
    tsx: ProgrammingLanguage.TypeScript,
    cts: ProgrammingLanguage.TypeScript,
    mts: ProgrammingLanguage.TypeScript,
    py: ProgrammingLanguage.Python,
    rb: 'Ruby',
    md: ProgrammingLanguage.Markdown,
    markdown: ProgrammingLanguage.Markdown,
    php: 'PHP',
    go: ProgrammingLanguage.Go,
    java: ProgrammingLanguage.Java,
    c: 'C',
    cpp: 'C++',
    cs: 'C#',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    rs: 'Rust',
    txt: ProgrammingLanguage.PlainText,
}

export function extensionForLanguage(language: string): string | undefined {
    for (const extension of Object.keys(EXTENSION_TO_LANGUAGE)) {
        if (EXTENSION_TO_LANGUAGE[extension] === language) {
            return extension
        }
    }
    return undefined
}

/**
 * Infer the programming language of {@file} based solely on its filename.
 *
 * For languages that we want to programmatically treat specially, check the return value against
 * the {@link ProgrammingLanguage} enum instead of strings like 'java'.
 */
export function languageFromFilename(file: URI): string /* | ProgrammingLanguage */ {
    const extWithoutDot = uriExtname(file).slice(1)
    return EXTENSION_TO_LANGUAGE[extWithoutDot] ?? extWithoutDot
}

/**
 * Infer the language ID to use in a Markdown code block for the given filename's code.
 *
 * For example, a Go file would have the following Markdown:
 *
 *     ```go
 *     ... code ...
 *     ```
 *
 * In this example, the language ID is `go`.
 *
 * There is no standard ID convention for Markdown code blocks, so we have to do some guesswork.
 */
export function markdownCodeBlockLanguageIDForFilename(file: URI): string {
    return languageFromFilename(file).toLowerCase()
}
