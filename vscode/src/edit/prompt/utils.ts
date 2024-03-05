import * as vscode from 'vscode'

import type { ContextItem, ContextMessage } from '@sourcegraph/cody-shared'

type ExtractableContextMessage = Required<Pick<ContextMessage, 'file'>> & ContextMessage

const contextMessageToContextItem = ({ text, file }: ExtractableContextMessage): ContextItem => {
    return {
        type: 'file',
        content: text,
        range: file.range
            ? new vscode.Range(
                  new vscode.Position(file.range.start.line, file.range.start.character),
                  new vscode.Position(file.range.end.line, file.range.end.character)
              )
            : undefined,
        repoName: file.repoName,
        revision: file.revision,
        source: file.source,
        title: file.title,
        uri: file.uri,
    }
}

const contextMessageIsExtractable = (
    contextMessage: ContextMessage
): contextMessage is ExtractableContextMessage => {
    return contextMessage.file !== undefined
}

/**
 * Extract `ContextItems` from `ContextMessages` for interoperability
 * between existing context mechanisms in the codebase.
 *
 * TODO: These types are ultimately very similar, we should refactor this so we
 * can avoid maintaining both types.
 */
export const extractContextItemsFromContextMessages = (
    contextMessages: ContextMessage[]
): ContextItem[] => {
    return contextMessages.filter(contextMessageIsExtractable).map(contextMessageToContextItem)
}
