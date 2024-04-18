import * as vscode from 'vscode'

import { PromptString } from '@sourcegraph/cody-shared'
import { updateRangeMultipleChanges } from '../non-stop/tracked-range'
import type { Supercompletion } from './get-supercompletion'

const GHOST_TEXT_COLOR = new vscode.ThemeColor('editorGhostText.foreground')

const reviewHintDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
        contentText: '✨ Review Supercompletions | Shift+Ctrl+↓ Go to Next',
        color: GHOST_TEXT_COLOR,
        margin: '0 0 0 1em',
    },
})

const inlineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(118,80,237,0.05)',
    border: '1px solid rgba(188,94,84,0.5)',
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
    private supercompletions: Map</* uri */ string, RenderedSupercompletion[]> = new Map()
    private codeLensChangeEmitter = new vscode.EventEmitter<void>()

    private disposables: vscode.Disposable[] = []

    public onDidChangeCodeLenses = this.codeLensChangeEmitter.event

    constructor(
        readonly window: Pick<typeof vscode.window, 'onDidChangeTextEditorSelection'> = vscode.window,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        this.disposables.push(
            vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
            vscode.languages.registerHoverProvider({ scheme: 'file' }, this),
            window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this)),

            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)),
            workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)),

            vscode.commands.registerCommand('cody.supercompletion.jumpTo', ([direction]: any) =>
                this.jumpTo(direction)
            )
        )
    }

    rerender(editor: vscode.TextEditor) {
        const supercompletionsInDocument =
            this.supercompletions.get(editor.document.uri.toString()) ?? []

        // Update keyboard shortcut enablement
        const hasActionableSupercompletion = supercompletionsInDocument.length > 0
        void vscode.commands.executeCommand(
            'setContext',
            'cody.hasActionableSupercompletion',
            hasActionableSupercompletion
        )

        const isSelectionInsideSupercompletion = supercompletionsInDocument.some(({ range }) =>
            range.contains(editor.selection.active)
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
            supercompletionsInDocument.map(s => s.range)
        )
    }

    public jumpTo(direction: 'next' | 'previous' = 'next') {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const supercompletionsInDocument =
            this.supercompletions.get(editor.document.uri.toString()) ?? []

        const currentLine = editor.selection.active.line

        let nextSupercompletion: RenderedSupercompletion | undefined
        const sortedSupercompletionAsc = [...supercompletionsInDocument].sort(
            (a, b) => a.range.start.line - b.range.start.line
        )
        if (direction === 'next') {
            nextSupercompletion = sortedSupercompletionAsc.find(s => s.range.start.line > currentLine)
            if (!nextSupercompletion && sortedSupercompletionAsc.length > 0) {
                nextSupercompletion = sortedSupercompletionAsc[0]
            }
        } else {
            nextSupercompletion = sortedSupercompletionAsc.findLast(
                s => s.range.start.line < currentLine
            )
            if (!nextSupercompletion && sortedSupercompletionAsc.length > 0) {
                nextSupercompletion = sortedSupercompletionAsc[sortedSupercompletionAsc.length - 1]
            }
        }

        if (!nextSupercompletion) {
            return
        }

        const { range } = nextSupercompletion
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
        editor.selection = new vscode.Selection(range.start, range.start)
        vscode.commands.executeCommand('editor.action.showHover')
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const supercompletionsInDocument = this.supercompletions.get(document.uri.toString()) ?? []

        const lenses: vscode.CodeLens[] = []
        for (const { supercompletion, range } of supercompletionsInDocument) {
            const summary = new vscode.CodeLens(range, {
                command: 'cody.supercompletion.apply',
                title: `$(cody-logo) ${supercompletion.summary}`,
                arguments: [supercompletion, range],
            } as vscode.Command)
            const apply = new vscode.CodeLens(range, {
                command: 'cody.supercompletion.apply',
                title: 'Apply ⌥A',
                arguments: [supercompletion, range],
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
        const supercompletionsInDocument = this.supercompletions.get(document.uri.toString()) ?? []

        const contents: vscode.MarkdownString[] = []
        for (const { supercompletion, hover } of supercompletionsInDocument) {
            if (!supercompletion.location.range.contains(position)) {
                continue
            }
            contents.push(hover)
        }
        return { contents }
    }

    add(supercompletion: Supercompletion) {
        const uri = supercompletion.location.uri.toString()
        if (!this.supercompletions.has(uri)) {
            this.supercompletions.set(uri, [])
        }
        const supercompletionsInDocument = this.supercompletions.get(uri)!

        const supercompletionOverlappingRange = supercompletionsInDocument.find(
            s => !!s.range.intersection(supercompletion.location.range)
        )
        if (supercompletionOverlappingRange) {
            // Avoid adding a supercompletion over another supercompletion
            return
        }

        const renderableDiff = PromptString.fromGitDiff(
            supercompletion.location.uri,
            supercompletion.current,
            supercompletion.updated
        )

        const markdownString = new vscode.MarkdownString()
        markdownString.supportHtml = true
        markdownString.appendMarkdown(`$(cody-logo) ${supercompletion.summary}`)
        markdownString.appendText('\n\n')
        markdownString.appendMarkdown(`\`\`\`diff\n${renderableDiff}\n\`\`\``)
        markdownString.appendText('\n\n')
        markdownString.appendText('Supercompletion by Cody')

        // TODO: Add it sorted on the range start line
        supercompletionsInDocument.push({
            supercompletion,
            hover: markdownString,
            range: supercompletion.location.range,
        })
        // TODO: Can't assume this is the active text editor
        this.rerender(vscode.window.activeTextEditor!)
        this.codeLensChangeEmitter.fire()
    }

    remove(supercompletion: Supercompletion) {
        const uri = supercompletion.location.uri.toString()
        const supercompletionsInDocument = this.supercompletions.get(uri)
        if (!supercompletionsInDocument) {
            return
        }

        this.supercompletions.set(
            uri,
            supercompletionsInDocument.filter(
                ({ supercompletion: { id: otherId } }) => otherId !== supercompletion.id
            )
        )
        // TODO: Can't assume this is the active text editor
        this.rerender(vscode.window.activeTextEditor!)
        this.codeLensChangeEmitter.fire()
    }

    private onDidChangeTextEditorSelection({ textEditor }: vscode.TextEditorSelectionChangeEvent): void {
        this.rerender(textEditor)
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const supercompletionsInDocument = this.supercompletions.get(event.document.uri.toString())
        if (!supercompletionsInDocument) {
            return
        }

        // Create a list of changes that can be mutated by the `updateRangeMultipleChanges` function
        const mutableChanges = event.contentChanges.map(change => ({
            range: change.range,
            text: change.text,
        }))

        const supercompletionsToDelete = []
        for (const supercompletion of supercompletionsInDocument) {
            // If any of the edits overlap with a supercompletion, remove it.
            // Otherwise adjust the range
            const didChange = mutableChanges.find(change =>
                change.range.intersection(supercompletion.range)
            )

            if (didChange) {
                supercompletionsToDelete.push(supercompletion.supercompletion)
            } else {
                supercompletion.range = updateRangeMultipleChanges(supercompletion.range, mutableChanges)
            }
        }

        for (const supercompletion of supercompletionsToDelete) {
            this.remove(supercompletion)
        }

        this.rerender(vscode.window.activeTextEditor!)
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const supercompletionsInDocument = this.supercompletions.get(file.oldUri.toString()) ?? []
            const supercompletionsToDelete = []
            for (const { supercompletion } of supercompletionsInDocument) {
                supercompletionsToDelete.push(supercompletion)
            }
            for (const supercompletion of supercompletionsToDelete) {
                this.remove(supercompletion)
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.supercompletions.delete(uri.toString())
        }
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
