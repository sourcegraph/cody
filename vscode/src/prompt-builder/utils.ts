import {
    type ContextItem,
    type Message,
    ProgrammingLanguage,
    languageFromFilename,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
    populateMarkdownContextTemplate,
} from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'
import { URI } from 'vscode-uri'

export function contextItemId(contextItem: ContextItem): string {
    const uri = contextItem.uri.toString()

    if (contextItem.range) {
        return `${uri}#${contextItem.range.start.line}:${contextItem.range.end.line}`
    }

    if (contextItem.content) {
        return `${uri}#${SHA256(contextItem.content).toString()}`
    }

    return uri
}

export function renderContextItem(contextItem: ContextItem): Message[] {
    // Do not create context item for empty file
    if (!contextItem.content?.trim()?.length) {
        return []
    }
    let messageText: string
    const uri = contextItem.source === 'unified' ? URI.parse(contextItem.title || '') : contextItem.uri
    if (contextItem.source === 'selection') {
        messageText = populateCurrentSelectedCodeContextTemplate(contextItem.content, uri)
    } else if (contextItem.source === 'editor') {
        // This template text works best with prompts in our commands
        // Using populateCodeContextTemplate here will cause confusion to Cody
        const templateText = 'Codebase context from file path {fileName}: '
        messageText = populateContextTemplateFromText(templateText, contextItem.content, uri)
    } else if (contextItem.source === 'terminal') {
        messageText = contextItem.content
    } else if (languageFromFilename(uri) === ProgrammingLanguage.Markdown) {
        messageText = populateMarkdownContextTemplate(contextItem.content, uri, contextItem.repoName)
    } else {
        messageText = populateCodeContextTemplate(contextItem.content, uri, contextItem.repoName)
    }
    return [
        { speaker: 'human', text: messageText },
        { speaker: 'assistant', text: 'Ok.' },
    ]
}
