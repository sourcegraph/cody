import { ProgrammingLanguage, languageFromFilename } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

function matchJavascriptFormatting(incoming: string, original: string): string {
    const incomingHasSemiColons = incoming.includes(';')
    const originalHasSemiColons = original.includes(';')

    if (incomingHasSemiColons && !originalHasSemiColons) {
        // Trim semicolons from the end of lines
        return incoming.replace(/;(\s*$)/gm, '$1')
    }

    return incoming
}

export function matchLanguage(incoming: string, original: string, uri: vscode.Uri): string {
    const language = languageFromFilename(uri)

    // Apply language specific formatting
    switch (language) {
        case ProgrammingLanguage.TypeScript:
        case ProgrammingLanguage.JavaScript:
            return matchJavascriptFormatting(incoming, original)
    }

    return incoming
}
