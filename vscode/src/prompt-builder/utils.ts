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
            // title is a required field for ContextItemOpenctx, only checking for type safety here.
            if (contextItem.type === 'openctx' && title) {
                messageText = ps`Content for "{title}" from {displayPath}:\n"`
                    .replace('{title}', title)
                    .replace('{displayPath}', PromptString.fromDisplayPath(uri))
                    .concat(content)
            } else {
                messageText = populateCodeContextTemplate(content, uri, repoName)
                if (
                    contextItem.type === 'file' &&
                    contextItem.annotations &&
                    contextItem.annotations.length
                ) {
                    // TODO(dyma): move to a separate function
                    let annotations = ps`\nAnnotations from OpenCtx providers:`
                    for (const annotation of contextItem.annotations) {
                        if (!annotation.content) {
                            continue
                        }
                        const { title, content } = PromptString.fromAnnotation({
                            ...annotation,
                            content: annotation.content,
                            uri: URI.file(annotation.uri),
                        })
                        annotations = annotations.concat(
                            ps`\n{title}:\n{annotation}`
                                .replace('{title}', title)
                                .replace('{annotation}', content)
                        )
                    }
                    messageText = messageText.concat(annotations)
                }
            }
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
