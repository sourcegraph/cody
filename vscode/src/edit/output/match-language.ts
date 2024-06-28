import { ProgrammingLanguage, languageFromFilename } from '@sourcegraph/cody-shared'
import type { FixupTask } from '../../non-stop/FixupTask'

export function matchJavascriptFormatting(incoming: string, original: string): string {
    const incomingHasSemiColons = incoming.includes(';')
    const originalHasSemiColons = original.includes(';')

    if (incomingHasSemiColons && !originalHasSemiColons) {
        // Trim semicolons from the end of lines
        return incoming.replace(/;(\s*$)/gm, '$1')
    }

    return incoming
}

export function matchLanguage(text: string, task: FixupTask): string {
    const language = languageFromFilename(task.fixupFile.uri)

    // Apply language specific formatting
    switch (language) {
        case ProgrammingLanguage.TypeScript:
        case ProgrammingLanguage.JavaScript:
            return matchJavascriptFormatting(text, task.original)
    }

    return text
}
