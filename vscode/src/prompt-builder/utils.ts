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
    const { content, repoName, title } = PromptString.fromContextItem(contextItem)

    // If true, this context item appears in the chat input as a context chip.
    const isRequestedInChatInput =
        source === ContextItemSource.User || source === ContextItemSource.Initial

    // Do not create context item for empty file unless the context item is
    // explicitly listed in the chat input. See CODY-3421 why we want to include
    // empty files so that they can target URIs for smart apply.
    if (content === undefined || (!isRequestedInChatInput && content.trim().length === 0)) {
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
            // title is a required field for ContextItemOpenctx, only checking for type safety here.
            if (contextItem.type === 'openctx' && title) {
                messageText = ps`Content for "{title}" from {displayPath}:\n"`
                    .replace('{title}', title)
                    .replace('{displayPath}', PromptString.fromDisplayPath(uri))
                    .concat(content)
            } else {
                messageText = populateCodeContextTemplate(content, uri, repoName)
            }
    }

    return { speaker: 'human', text: messageText, file: contextItem }
}

export function getContextItemTokenUsageType(item: ContextItem): ContextTokenUsageType {
    switch (item.source) {
        case 'user':
        case 'initial':
        case 'terminal':
        case 'selection':
        case 'editor':
            return 'user'
        default:
            return 'corpus'
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

/**
 * If the context item is a user-added item:
 * - `user` - The item was added by the user through @-mentions or other user input.
 * - `selection` - The item was added by the user through a selection.
 */
export function isUserAddedItem(item: ContextItem): boolean {
    return getContextItemTokenUsageType(item) === 'user'
}

/**
 * Categorizes context items into explicit and implicit mentions.
 *
 * @param mentions - An array of ContextItem objects to categorize.
 * @returns An object containing two arrays:
 *   - explicitMentions: ContextItems added by the user.
 *   - implicitMentions: ContextItems not added by the user.
 */
export function getCategorizedMentions(mentions: ContextItem[]): {
    explicitMentions: ContextItem[]
    implicitMentions: ContextItem[]
} {
    const explicitMentions: ContextItem[] = []
    const implicitMentions: ContextItem[] = []

    for (const m of mentions) {
        if (isUserAddedItem(m)) {
            explicitMentions.push(m)
        } else {
            implicitMentions.push(m)
        }
    }

    return { explicitMentions, implicitMentions }
}
