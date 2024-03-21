import * as vscode from 'vscode'
import { createGitDiff } from './recent-edits/create-git-diff'

import type { Supercompletion } from './get-supercompletion'

const GHOST_TEXT_COLOR = new vscode.ThemeColor('editorGhostText.foreground')

const reviewHintDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        contentText: '✨ Supercompletions | Shift+Ctrl+↓ Go to Next',
        color: GHOST_TEXT_COLOR,
        margin: '0 0 0 1em',
    },
})

const inlineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(118,80,237,0.2)',
    border: '1px solid rgba(188,94,84)',
})

interface RenderedSupercompletion {
    supercompletion: Supercompletion
    // The current range, can be different from the original range when the supercompletion is added
    range: vscode.Range
    // A markdown string for the hover tooltips
    hover: vscode.MarkdownString
}

export class SupercompletionRenderer
    implements vscode.Disposable, vscode.CodeLensProvider, vscode.HoverProvider
{
    private supercompletions: RenderedSupercompletion[] = []
    private codeLensChangeEmitter = new vscode.EventEmitter<void>()

    private disposables: vscode.Disposable[] = []

    public onDidChangeCodeLenses = this.codeLensChangeEmitter.event

    constructor(
        readonly window: Pick<typeof vscode.window, 'onDidChangeTextEditorSelection'> = vscode.window
    ) {
        this.disposables.push(
            vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
            vscode.languages.registerHoverProvider({ scheme: 'file' }, this),
            window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this))
        )
    }

    rerender() {
        // Todo: Can't assume it's the active editor, need another way to find it
        const editor = vscode.window.activeTextEditor!

        const supercompletionsInDocument = this.supercompletions.filter(
            ({ supercompletion }) =>
                supercompletion.location.uri.toString() === editor.document.uri.toString()
        )

        const isSelectionInsideSupercompletion = supercompletionsInDocument.some(({ supercompletion }) =>
            supercompletion.location.range.contains(editor.selection.active)
        )

        if (
            editor.selection.isEmpty &&
            supercompletionsInDocument.length > 0 &&
            !isSelectionInsideSupercompletion
        ) {
            const currentLine = editor.selection.active.line
            const line = editor.document.lineAt(currentLine)
            const range = new vscode.Range(currentLine, 0, currentLine, line.text.length)
            editor.setDecorations(reviewHintDecorationType, [range])
        } else {
            editor.setDecorations(reviewHintDecorationType, [])
        }

        editor.setDecorations(
            inlineDecorationType,
            supercompletionsInDocument.map(s => s.supercompletion.location.range)
        )
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const supercompletionsInDocument = this.supercompletions.filter(
            ({ supercompletion }) => supercompletion.location.uri.toString() === document.uri.toString()
        )

        const lenses: vscode.CodeLens[] = []
        for (const { supercompletion } of supercompletionsInDocument) {
            const {
                location: { range },
            } = supercompletion

            const summary = new vscode.CodeLens(range, {
                command: 'cody.supercompletion.apply',
                title: `$(cody-logo) ${supercompletion.summary}`,
                arguments: [supercompletion],
            } as vscode.Command)
            const apply = new vscode.CodeLens(range, {
                command: 'cody.supercompletion.apply',
                title: 'Apply ⌥A',
                arguments: [supercompletion],
            } as vscode.Command)
            const discard = new vscode.CodeLens(range, {
                command: 'cody.supercompletion.discard',
                title: 'Discard ⌥R',
                arguments: [supercompletion],
            } as vscode.Command)

            lenses.push(summary, apply, discard)
        }
        return lenses
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const contents: vscode.MarkdownString[] = []
        for (const { supercompletion, hover } of this.supercompletions) {
            if (supercompletion.location.uri.toString() !== document.uri.toString()) {
                continue
            }
            if (!supercompletion.location.range.contains(position)) {
                continue
            }
            contents.push(hover)
        }
        return { contents }
    }

    add(supercompletion: Supercompletion) {
        const renderableDiff = createGitDiff(
            vscode.workspace.asRelativePath(supercompletion.location.uri.path),
            supercompletion.current,
            supercompletion.updated
        )

        const markdownString = new vscode.MarkdownString()
        markdownString.supportHtml = true
        markdownString.appendMarkdown(
            `$(cody-logo) ${supercompletion.summary} | <a href="#">Apply ⌥A</a> | <a href="#">Cancel ⌥R</a>`
        )
        markdownString.appendText('\n\n')
        markdownString.appendMarkdown(`\`\`\`diff\n${renderableDiff}\n\`\`\``)
        markdownString.appendText('\n\n')
        markdownString.appendText('Supercompletion by Cody')

        this.supercompletions.push({
            supercompletion,
            hover: markdownString,
            range: supercompletion.location.range,
        })
        this.rerender()
        this.codeLensChangeEmitter.fire()
    }

    remove(supercompletion: Supercompletion) {
        this.supercompletions = this.supercompletions.filter(
            ({ supercompletion: { id: otherId } }) => otherId !== supercompletion.id
        )
        this.rerender()
        this.codeLensChangeEmitter.fire()
    }

    private onDidChangeTextEditorSelection(): void {
        this.rerender()
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
