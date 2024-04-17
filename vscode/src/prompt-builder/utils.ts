import {
    type ContextItem,
    ContextItemSource,
    type ContextMessage,
    PromptString,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
    ps,
} from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'

export function renderContextItem(contextItem: ContextItem): ContextMessage | null {
    const promptContext = PromptString.fromContextItem(contextItem)
    // Do not create context item for empty file
    if (!promptContext.content?.trim()?.length) {
        return null
    }

    let messageText: PromptString
    const uri =
        contextItem.source === ContextItemSource.Unified
            ? URI.parse(contextItem.title || '')
            : contextItem.uri
    if (contextItem.source === ContextItemSource.Selection) {
        messageText = populateCurrentSelectedCodeContextTemplate(promptContext.content, uri)
    } else if (contextItem.source === ContextItemSource.Editor) {
        // This template text works best with prompts in our commands
        // Using populateCodeContextTemplate here will cause confusion to Cody
        const templateText = ps`Codebase context from file path {fileName}: `
        messageText = populateContextTemplateFromText(templateText, promptContext.content, uri)
    } else if (contextItem.source === ContextItemSource.Terminal) {
        messageText = promptContext.content
    } else {
        messageText = populateCodeContextTemplate(promptContext.content, uri, promptContext.repoName)
    }
    return { speaker: 'human', text: messageText, file: contextItem }
}
