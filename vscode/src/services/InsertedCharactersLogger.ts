import { isFileURI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { getExtensionDetails, logPrefix, telemetryService } from './telemetry'
import { telemetryRecorder } from './telemetry-v2'

const LOG_INTERVAL = 5 * 60 * 1000 // 5 minutes

export class InsertedCharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private counter = 0
    private nextTimeoutId: NodeJS.Timeout | null = null

    constructor(workspace: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'> = vscode.workspace) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public flush(): void {
        this.nextTimeoutId = null
        const characters = this.counter
        this.counter = 0

        const extDetails = getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration()))
        telemetryService.log(
            `${logPrefix(extDetails.ide)}:insertedCharacters`,
            { characters },
            {
                agent: true,
                hasV2Event: true,
            }
        )
        telemetryRecorder.recordEvent('cody', 'insertedCharacters', { metadata: { characters } })

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }
    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!isFileURI(event.document.uri)) {
            return
        }
        for (const change of event.contentChanges) {
            this.counter += change.text.length
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
