import * as vscode from 'vscode'

import type { ContextMessage } from '@sourcegraph/cody-shared'
import type { ContextItem } from '../../chat/chat-view/SimpleChatModel'

type ExtractableContextMessage = Required<Pick<ContextMessage, 'file'>> & ContextMessage

const contextMessageToContextItem = ({ text, file }: ExtractableContextMessage): ContextItem => {
    return {
        text: text,
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

export const extractContextItemsFromContextMessages = (
    contextMessages: ContextMessage[]
): ContextItem[] => {
    return contextMessages.filter(contextMessageIsExtractable).map(contextMessageToContextItem)
}
