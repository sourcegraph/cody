import { isFileURI } from '@sourcegraph/cody-shared'
import { diffChars } from 'diff'
import * as vscode from 'vscode'

import { getConfiguration } from '../configuration'
import { getExtensionDetails, logPrefix, telemetryService } from './telemetry'
import { telemetryRecorder } from './telemetry-v2'

export const LOG_INTERVAL = 5 * 60 * 1000 // 5 minutes

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

        const extDetails = getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration()))
        telemetryService.log(
            `${logPrefix(extDetails.ide)}:characters`,
            { insertedCharacters, deletedCharacters },
            {
                agent: true,
                hasV2Event: true,
            }
        )
        telemetryRecorder.recordEvent('cody', 'characters', {
            metadata: { insertedCharacters, deletedCharacters },
        })

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }
    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!isFileURI(event.document.uri)) {
            return
        }
        for (const change of event.contentChanges) {
            const existingTextAtRange = event.document.getText(change.range)

            const rangeLength = change.range.end.character - change.range.start.character
            if (existingTextAtRange.length < rangeLength) {
                // The document already has the updated changes applied with some characters deleted
                // These will not be included in the diff below and thus we count them here
                this.deleted += Math.max(0, rangeLength - existingTextAtRange.length)
            }

            const diff = diffChars(existingTextAtRange, change.text)
            for (const charChange of diff) {
                if (charChange.added) {
                    this.inserted += charChange.value.length
                }
                if (charChange.removed) {
                    this.deleted += charChange.value.length
                }
            }
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
