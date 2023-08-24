import * as vscode from 'vscode'

export type interactionId = string

export class InlineInteraction {
    public id: interactionId

    constructor(
        public readonly instruction: string,
        public selectionRange: vscode.Range,
        public thread: vscode.CommentThread
    ) {
        this.id = Date.now().toString(36).replace(/\d+/g, '')
    }
}
