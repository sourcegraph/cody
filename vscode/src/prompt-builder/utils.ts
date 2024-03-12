import {
    type ContextItem,
    type ContextMessage,
    ProgrammingLanguage,
    languageFromFilename,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
    populateMarkdownContextTemplate,
} from '@sourcegraph/cody-shared'
import { ContextItemSource } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { URI } from 'vscode-uri'

export function renderContextItem(contextItem: ContextItem): ContextMessage | null {
    // Do not create context item for empty file
    if (!contextItem.content?.trim()?.length) {
        return null
    }
    let messageText: string
    const uri =
        contextItem.source === ContextItemSource.Unified
            ? URI.parse(contextItem.title || '')
            : contextItem.uri
    if (contextItem.source === ContextItemSource.Selection) {
        messageText = populateCurrentSelectedCodeContextTemplate(contextItem.content, uri)
    } else if (contextItem.source === ContextItemSource.Editor) {
        // This template text works best with prompts in our commands
        // Using populateCodeContextTemplate here will cause confusion to Cody
        const templateText = 'Codebase context from file path {fileName}: '
        messageText = populateContextTemplateFromText(templateText, contextItem.content, uri)
    } else if (contextItem.source === ContextItemSource.Terminal) {
        messageText = contextItem.content
    } else if (languageFromFilename(uri) === ProgrammingLanguage.Markdown) {
        messageText = populateMarkdownContextTemplate(contextItem.content, uri, contextItem.repoName)
    } else {
        messageText = populateCodeContextTemplate(contextItem.content, uri, contextItem.repoName)
    }
    return { speaker: 'human', text: messageText, file: contextItem }
}
