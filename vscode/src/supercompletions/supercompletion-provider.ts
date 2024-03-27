import type { ChatClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { CodyStatusBar } from '../services/StatusBar'
import { type Supercompletion, getSupercompletions } from './get-supercompletion'
import { RecentEditsRetriever } from './recent-edits/recent-edits-retriever'
import { SupercompletionRenderer } from './renderer'

const EDIT_HISTORY = 5 * 60 * 1000
const SUPERCOMPLETION_TIMEOUT = 2 * 1000

export class SupercompletionProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private trackedTimeouts: Map<string, AbortController> = new Map()
    private recentEditsRetriever: RecentEditsRetriever

    private renderer: SupercompletionRenderer
    private ignoreNextChange = false

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
        this.renderer = new SupercompletionRenderer()
        this.recentEditsRetriever = new RecentEditsRetriever(EDIT_HISTORY, workspace)

        this.disposables.push(
            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)),
            workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)),

            vscode.commands.registerCommand(
                'cody.supercompletion.apply',
                (supercompletion: Supercompletion, range: vscode.Range) =>
                    this.applySupercompletion(supercompletion, range)
            ),
            vscode.commands.registerCommand(
                'cody.supercompletion.discard',
                (supercompletion: Supercompletion) => this.discardSupercompletion(supercompletion)
            ),

            this.renderer,
            this.recentEditsRetriever
        )
    }

    public async provideSupercompletions(
        document: vscode.TextDocument,
        abortController: AbortController
    ): Promise<void> {
        const cancel = this.config.statusBar.startLoading('Loading supercompletions...')
        try {
            for await (const supercompletion of getSupercompletions({
                document,
                abortSignal: abortController.signal,

                recentEditsRetriever: this.recentEditsRetriever,
                chat: this.config.chat,
            })) {
                this.renderer.add(supercompletion)
            }
        } finally {
            cancel()
        }
    }

    public applySupercompletion(supercompletion: Supercompletion, range: vscode.Range) {
        // Prevent supercompletion insertions from adding more supercompletions. This would make the
        // UX very confusing
        this.ignoreNextChange = true

        const editor = vscode.window.activeTextEditor!
        editor.edit(editBuilder => {
            editBuilder.replace(range, supercompletion.updated)
        })
        this.renderer.remove(supercompletion)
    }

    public discardSupercompletion(supercompletion: Supercompletion) {
        this.renderer.remove(supercompletion)
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

        if (this.ignoreNextChange) {
            this.ignoreNextChange = false
            return
        }

        const abortController = new AbortController()
        this.trackedTimeouts.set(document.uri.toString(), abortController)
        const interval = setTimeout(() => {
            this.provideSupercompletions(document, abortController)
            this.trackedTimeouts.delete(document.uri.toString())
        }, SUPERCOMPLETION_TIMEOUT)
        abortController.signal.addEventListener('abort', () => {
            clearTimeout(interval)
        })
    }
}
