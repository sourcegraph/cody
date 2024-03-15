import type { ChatClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { CodyStatusBar } from '../services/StatusBar'
import { Supercompletion, getSupercompletions } from './get-supercompletion'
import { RecentEditsRetriever } from './recent-edits/recent-edits-retriever'

const EDIT_HISTORY = 5 * 60 * 1000
const SUPERCOMPLETION_TIMEOUT = 2 * 1000

export class SupercompletionProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private trackedTimeouts: Map<string, AbortController> = new Map()
    private recentEditsRetriever: RecentEditsRetriever
    private lensProvider: MyCodeLensProvider

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
        this.lensProvider = new MyCodeLensProvider()
        this.disposables.push(
            vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this.lensProvider)
        )
        this.recentEditsRetriever = new RecentEditsRetriever(EDIT_HISTORY, workspace)
    }

    public async onProvideSupercompletion(
        document: vscode.TextDocument,
        abortController: AbortController
    ): Promise<void> {
        // Todo: Can't assume it's the active editor, need another way to find it
        const editor = vscode.window.activeTextEditor!

        const cancel = this.config.statusBar.startLoading('Loading supercompletions...')
        try {
            for await (const supercompletion of getSupercompletions({
                document,
                abortSignal: abortController.signal,

                recentEditsRetriever: this.recentEditsRetriever,
                chat: this.config.chat,
            })) {
                renderSupercompletion(editor, this.lensProvider, supercompletion)
            }
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

class MyCodeLensProvider implements vscode.CodeLensProvider {
    private emitter = new vscode.EventEmitter<void>()
    public onDidChangeCodeLenses = this.emitter.event

    private lenses: Map<string, vscode.CodeLens[]> = new Map()
    public addCodeLens(uri: vscode.Uri, codeLens: vscode.CodeLens): void {
        const existingCodeLenses = this.lenses.get(uri.toString()) || []
        existingCodeLenses.push(codeLens)
        this.lenses.set(uri.toString(), existingCodeLenses)
        this.emitter.fire()
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        return this.lenses.get(document.uri.toString()) || []
    }
}

function renderSupercompletion(
    editor: vscode.TextEditor,
    lensProvider: MyCodeLensProvider,
    supercompletion: Supercompletion
): void {
    const range = supercompletion.location.range

    // if (range.isEmpty) {
    // const decorationType = vscode.window.createTextEditorDecorationType({
    //     backgroundColor: 'green',
    //     border: '5px solid white',
    //     before: {
    //         contentText: `✨ ${supercompletion.summary} [Apply]\nWow!`,
    //         margin: '0 0 0 0.5em',
    //         color: 'white',
    //         border: '1px solid red',
    //     },
    // })
    // editor.setDecorations(decorationType, [supercompletion.location.range])

    // const lens = new vscode.CodeLens(range, {
    //     command: 'cody.supercompletion.apply',
    //     title: `✨ ${supercompletion.summary} [Apply]\nWow!`,
    //     tooltip: 'What is that?',
    // } as vscode.Command)
    // lensProvider.addCodeLens(editor.document.uri, lens)
    // lensProvider.addCodeLens(editor.document.uri, lens)

    const MyInlineEditProvider = class {
        public provideInlineCompletionEdits(
            document: vscode.TextDocument,
            _context: any,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<any> {
            console.log({ _context })

            return new (vscode as any).InlineEdit(supercompletion.updated, range)
        }
    }
    ;(vscode.languages as any).registerInlineEditProvider(
        '*' as vscode.DocumentSelector,
        new MyInlineEditProvider()
    )

    vscode.commands.executeCommand('editor.action.inlineEdit.trigger')

    return
    // }
    // const decorationType = vscode.window.createTextEditorDecorationType({
    //     backgroundColor: 'green',
    //     border: '5px solid white',
    // })
    // editor.setDecorations(decorationType, [supercompletion.location.range])
}
