import * as uuid from 'uuid'
import * as vscode from 'vscode'

import type { AutoeditRequestID } from './analytics-logger'

interface AutoeditCompletionItemParams {
    id: AutoeditRequestID | null
    insertText: string | vscode.SnippetString
    range: vscode.Range
    command?: vscode.Command

    /** For debugging purposes */
    withoutCurrentLinePrefix: {
        insertText: string
        range: vscode.Range
    }
}

export class AutoeditCompletionItem extends vscode.InlineCompletionItem {
    /**
     * An ID used to track this particular completion item. This is used mainly for the Agent which,
     * given it's JSON RPC interface, needs to be able to identify the completion item and can not
     * rely on the object reference like the VS Code API can. This allows us to simplify external
     * API's that require the completion item to only have an ID.
     */
    public id: string
    public withoutCurrentLinePrefix: AutoeditCompletionItemParams['withoutCurrentLinePrefix']

    constructor(params: AutoeditCompletionItemParams) {
        const { insertText, range, command, id, withoutCurrentLinePrefix } = params
        super(insertText, range, command)
        this.id = id || uuid.v4()
        this.withoutCurrentLinePrefix = withoutCurrentLinePrefix
    }
}
