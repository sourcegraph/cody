import * as uuid from 'uuid'
import * as vscode from 'vscode'

interface AutoeditCompletionItemParams {
    insertText: string | vscode.SnippetString
    range: vscode.Range
    command?: vscode.Command
}

export class AutoeditCompletionItem extends vscode.InlineCompletionItem {
    /**
     * An ID used to track this particular completion item. This is used mainly for the Agent which,
     * given it's JSON RPC interface, needs to be able to identify the completion item and can not
     * rely on the object reference like the VS Code API can. This allows us to simplify external
     * API's that require the completion item to only have an ID.
     */
    public id: string

    constructor(params: AutoeditCompletionItemParams) {
        const { insertText, range, command } = params
        super(insertText, range, command)
        this.id = uuid.v4()
    }
}
