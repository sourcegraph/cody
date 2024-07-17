import { isFileURI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes

export class CharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private inserted = 0
    private deleted = 0
    private nextTimeoutId: NodeJS.Timeout | null = null

    constructor(workspace: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'> = vscode.workspace) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public flush(): void {
        this.nextTimeoutId = null
        const insertedCharacters = this.inserted
        const deletedCharacters = this.deleted
        this.inserted = 0
        this.deleted = 0

        telemetryRecorder.recordEvent('cody.characters', 'flush', {
            metadata: { insertedCharacters, deletedCharacters },
        })

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }
    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!isFileURI(event.document.uri)) {
            return
        }
        for (const change of event.contentChanges) {
            // We use change.rangeLength for deletions because:
            // 1. It represents the length of the text being replaced, including newline characters.
            // 2. It accurately accounts for multi-line deletions.
            // 3. For pure deletions (without insertions), this will be the number of characters removed.
            // 4. For replacements, this represents the "old" text that's being replaced.
            this.deleted += change.rangeLength

            // We use change.text.length for insertions because:
            // 1. It represents the length of the new text being inserted, including newline characters.
            // 2. It accurately accounts for multi-line insertions.
            // 3. For pure insertions (without deletions), this will be the number of characters added.
            // 4. For replacements, this represents the "new" text that's replacing the old.
            this.inserted += change.text.length

            // Note: In the case of replacements, both deleted and inserted will be incremented.
            // This accurately represents that some text was removed and some was added, even if
            // the lengths are the same.
        }
    }

    public dispose(): void {
        this.flush()
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
