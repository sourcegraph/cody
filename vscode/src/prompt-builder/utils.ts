import {
    type ContextItem,
    ContextItemSource,
    type ContextMessage,
    type ContextTokenUsageType,
    PromptString,
    displayPath,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
    ps,
} from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'

export function renderContextItem(contextItem: ContextItem): ContextMessage | null {
    const { source, range } = contextItem
    const { content, repoName } = PromptString.fromContextItem(contextItem)
    // Do not create context item for empty file
    if (!content?.trim()?.length) {
        return null
    }

    const uri = getContextItemLocalUri(contextItem)

    let messageText: PromptString

    switch (source) {
        case ContextItemSource.Selection:
            messageText = populateCurrentSelectedCodeContextTemplate(content, uri, range)
            break
        case ContextItemSource.Editor:
            // This template text works best with prompts in our commands
            // Using populateCodeContextTemplate here will cause confusion to Cody
            messageText = populateContextTemplateFromText(
                ps`Codebase context from file path {displayPath}: `,
                content,
                uri
            )
            break
        case ContextItemSource.Terminal:
        case ContextItemSource.History:
            messageText = content
            break
        default:
            messageText = populateCodeContextTemplate(content, uri, repoName)
            break
    }

    return { speaker: 'human', text: messageText, file: contextItem }
}

export function getContextItemTokenUsageType(item: ContextItem): ContextTokenUsageType {
    switch (item.source) {
        case 'user':
        case 'selection':
            return 'user'
        default:
            return 'enhanced'
    }
}

/**
 * Returns the display path for a context item.
 *
 * For unified items, the title is used as the display path.
 * For other items, the URI is used.
 */
export function getContextItemDisplayPath(item: ContextItem): string {
    return displayPath(getContextItemLocalUri(item))
}

function getContextItemLocalUri(item: ContextItem): URI {
    return item.source === ContextItemSource.Unified ? URI.parse(item.title || '') : item.uri
}
