import {
    type ContextItem,
    ContextItemSource,
    type ContextMessage,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
} from '@sourcegraph/cody-shared'

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
    } else {
        messageText = populateCodeContextTemplate(contextItem.content, uri, contextItem.repoName)
    }
    return { speaker: 'human', text: messageText, file: contextItem }
}
