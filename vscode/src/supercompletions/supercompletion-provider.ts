import type { ChatClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { CodyStatusBar } from '../services/StatusBar'
import { Supercompletion, getSupercompletions } from './get-supercompletion'
import { createGitDiff } from './recent-edits/create-git-diff'
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

    public removeCodeLens(uri: vscode.Uri, codeLens: vscode.CodeLens): void {
        const existingCodeLenses = this.lenses.get(uri.toString()) || []
        existingCodeLenses.splice(existingCodeLenses.indexOf(codeLens), 1)
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
    const id = Math.random().toString(36).substr(2, 9)
    const range = supercompletion.location.range

    const disposables: vscode.Disposable[] = []

    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(118,80,237,0.2)',
        border: '1px solid rgba(188,94,84)',
    })
    disposables.push(decorationType)
    editor.setDecorations(decorationType, [supercompletion.location.range])

    const summary = new vscode.CodeLens(range, {
        command: `cody.supercompletion.apply.${id}`,
        title: `$(cody-logo) ${supercompletion.summary}`,
    } as vscode.Command)
    lensProvider.addCodeLens(editor.document.uri, summary)
    disposables.push(
        new vscode.Disposable(() => lensProvider.removeCodeLens(editor.document.uri, summary))
    )

    const apply = new vscode.CodeLens(range, {
        command: `cody.supercompletion.apply.${id}`,
        title: 'Apply ⌥A',
    } as vscode.Command)
    lensProvider.addCodeLens(editor.document.uri, apply)
    disposables.push(
        new vscode.Disposable(() => lensProvider.removeCodeLens(editor.document.uri, apply))
    )

    const cancel = new vscode.CodeLens(range, {
        command: 'cody.supercompletion.cancel',
        title: 'Cancel ⌥R',
    } as vscode.Command)
    lensProvider.addCodeLens(editor.document.uri, cancel)
    disposables.push(
        new vscode.Disposable(() => lensProvider.removeCodeLens(editor.document.uri, cancel))
    )

    const renderableDiff = createGitDiff(
        vscode.workspace.asRelativePath(supercompletion.location.uri.path),
        supercompletion.current,
        supercompletion.updated
    )

    const markdownString = new vscode.MarkdownString()
    markdownString.supportHtml = true
    markdownString.appendMarkdown(
        `✨ ${supercompletion.summary} <a href="#">Apply ⌥A</a> <a href="#">Cancel ⌥R</a>`
    )
    markdownString.appendText('\n\n')
    markdownString.appendMarkdown(`\`\`\`diff\n${renderableDiff}\n\`\`\``)
    markdownString.appendText('\n\n')
    markdownString.appendText('Supercompletion by Cody')

    disposables.push(
        vscode.languages.registerHoverProvider('*', {
            provideHover(document, position, token) {
                if (document.uri.toString() !== editor.document.uri.toString()) {
                    return
                }
                if (!supercompletion.location.range.contains(position)) {
                    return
                }
                return {
                    contents: [markdownString],
                }
            },
        })
    )

    vscode.commands.registerCommand(`cody.supercompletion.apply.${id}`, async () => {
        await applySupercompletion(editor, supercompletion)
        for (const disposable of disposables) {
            disposable.dispose()
        }
    })

    return
}

async function applySupercompletion(editor: vscode.TextEditor, supercompletion: Supercompletion) {
    editor.edit(editBuilder => {
        editBuilder.replace(supercompletion.location.range, supercompletion.updated)
    })
}
