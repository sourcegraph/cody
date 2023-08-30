import * as vscode from 'vscode'

import { ContextFile, PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'

export interface ContextDecoration {
    text: string
}

function contextFileToUri(contextFile: ContextFile): vscode.Uri {
    // TODO: Between URL escaping and multiple workspace folders, this is
    // not right. But it is probably usually right. Make this robust.
    return vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, contextFile.fileName)
}

export class ContextDecorator implements vscode.Disposable {
    // TODO: Add a decoration for submitted, but clipped, context
    private decorationUsedContext: vscode.TextEditorDecorationType
    // This is keyed on vscode.Uri string representations; we use string for
    // the right equality
    private decorations: Map<string, ContextDecoration[]> = new Map()
    private disposables: vscode.Disposable[] = []

    constructor() {
        // TODO: Use ThemeColor here and make this configurable
        this.decorationUsedContext = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'lightgreen',
            border: '2px dashed orange',
            isWholeLine: false,
        })
        this.disposables.push(this.decorationUsedContext)
        this.disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(editors => this.didChangeVisibleTextEditors(editors))
        )
    }

    private didChangeVisibleTextEditors(editors: readonly vscode.TextEditor[]): void {
        for (const editor of editors) {
            this.updateDecorations(editor)
        }
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        const specs = this.decorations.get(editor.document.uri.toString())
        if (!specs) {
            editor.setDecorations(this.decorationUsedContext, [])
            return
        }

        const text = editor.document.getText()
        const decorations = specs.map(spec => {
            const startOffset = text.indexOf(spec.text)
            if (startOffset === -1) {
                // TODO: Do some diff calculation to show we sent some out of date context
                debugger
                throw new Error('bad/out of date context')
            }
            const endOffset = startOffset + spec.text.length
            return new vscode.Range(editor.document.positionAt(startOffset), editor.document.positionAt(endOffset))
        })
        // TODO: Add a hover to show which provider produced the context
        editor.setDecorations(this.decorationUsedContext, decorations)
    }

    // TODO: Also highlight preciseContext results
    public didUseContext(contextFiles: readonly ContextFile[], preciseContexts: readonly PreciseContext[]): void {
        this.decorations.clear()
        for (const contextFile of contextFiles) {
            // TODO: This object actually has precedingText, followingText, selectedText, selectedRange
            // how does transcript crack these open?
            const uri = contextFileToUri(contextFile).toString()
            let specs = this.decorations.get(uri)
            if (!specs) {
                specs = []
                this.decorations.set(uri, specs)
            }
            // TODO: need to provide the actual context string here
            specs.push({
                text: 'hello world',
            })
        }
        // Actually we changed the decorations, not the editors, but the
        // functionality is the same
        this.didChangeVisibleTextEditors(vscode.window.visibleTextEditors)
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
