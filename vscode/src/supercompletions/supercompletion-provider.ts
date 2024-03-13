import type { ChatClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { CodyStatusBar } from '../services/StatusBar'
import { getSupercompletions } from './get-supercompletion'
import { RecentEditsRetriever } from './recent-edits/recent-edits-retriever'

const EDIT_HISTORY = 5 * 60 * 1000
const SUPERCOMPLETION_TIMEOUT = 2 * 1000

export class SupercompletionProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private trackedTimeouts: Map<string, AbortController> = new Map()
    private recentEditsRetriever: RecentEditsRetriever

    constructor(
        private readonly config: {
            statusBar: CodyStatusBar
            chat: ChatClient
        },
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
        this.recentEditsRetriever = new RecentEditsRetriever(EDIT_HISTORY, workspace)
    }

    public async onProvideSupercompletion(
        document: vscode.TextDocument,
        abortController: AbortController
    ): Promise<void> {
        const cancel = this.config.statusBar.startLoading('Loading supercompletions...')
        try {
            await getSupercompletions({
                document,
                abortSignal: abortController.signal,

                recentEditsRetriever: this.recentEditsRetriever,
                chat: this.config.chat,
            })
        } finally {
            cancel()
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme !== 'file') {
            return
        }
        this.resetTrackedTimeout(event.document)
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const abortController = this.trackedTimeouts.get(file.oldUri.toString())
            if (abortController) {
                abortController.abort()
            }
            this.trackedTimeouts.delete(file.oldUri.toString())
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            const abortController = this.trackedTimeouts.get(uri.toString())
            if (abortController) {
                abortController.abort()
            }
            this.trackedTimeouts.delete(uri.toString())
        }
    }

    public dispose(): void {
        this.recentEditsRetriever.dispose()
        this.trackedTimeouts.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    private resetTrackedTimeout(document: vscode.TextDocument): void {
        const existingAbortController = this.trackedTimeouts.get(document.uri.toString())
        if (existingAbortController) {
            existingAbortController.abort()
        }

        const abortController = new AbortController()
        this.trackedTimeouts.set(document.uri.toString(), abortController)
        const interval = setTimeout(() => {
            this.onProvideSupercompletion(document, abortController)
            this.trackedTimeouts.delete(document.uri.toString())
        }, SUPERCOMPLETION_TIMEOUT)
        abortController.signal.addEventListener('abort', () => {
            clearTimeout(interval)
        })
    }
}
