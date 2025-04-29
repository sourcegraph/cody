import * as vscode from 'vscode'
import type { AutoeditHotStreakID } from '../analytics-logger'
import type { RequestManager } from '../request-manager'

const NEXT_CURSOR_DECORATION = {
    decoration: vscode.window.createTextEditorDecorationType({ isWholeLine: true }),
    renderOptions: {
        after: {
            contentText: 'Tab to Jump',
            color: new vscode.ThemeColor('editorWidget.foreground'),
            backgroundColor: new vscode.ThemeColor('editorWidget.background'),
            borderColor: '#FF7867',
            border: '1px solid',
            margin: '0 0 0 1em',
            padding: '1px 3px',
            textDecoration: 'none; border-radius: 3px;',
        },
    },
}

interface CursorSuggestion {
    uri: vscode.Uri
    position: vscode.Position
    /**
     * If this suggestion is part of a hot-streak, we need to know about the id.
     * This is so we can update the request-manager just before we move the cursor.
     * That way, we can guarantee that the cursor change will retrieve the correct item from the cache.
     */
    hotStreakId?: AutoeditHotStreakID
}

/**
 * Manages next cursor suggestions.
 * Displays decorations and handles accepting the suggestion.
 */
export class NextCursorManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activeCursorSuggestion: CursorSuggestion | null = null

    constructor(protected requestManager: RequestManager) {
        this.disposables.push(
            vscode.commands.registerCommand('cody.nextCursor.suggest', (suggestion: CursorSuggestion) =>
                this.showNextCursorSuggestion(suggestion)
            ),
            vscode.commands.registerCommand('cody.nextCursor.accept', () =>
                this.acceptNextCursorSuggestion()
            ),
            vscode.commands.registerCommand('cody.nextCursor.discard', () =>
                this.hideNextCursorSuggestion()
            ),
            vscode.workspace.onDidChangeTextDocument(() => this.hideNextCursorSuggestion()),
            vscode.window.onDidChangeActiveTextEditor(activeEditor => {
                if (!this.activeCursorSuggestion || !activeEditor) {
                    return
                }

                const suggestionUri = this.activeCursorSuggestion.uri.toString()
                const activeUri = activeEditor.document.uri.toString()
                if (suggestionUri === activeUri) {
                    // Same editor, do nothing
                    return
                }

                this.hideNextCursorSuggestion()
            }),
            vscode.workspace.onDidCloseTextDocument(closedDocument => {
                if (!this.activeCursorSuggestion) {
                    return
                }

                const suggestionUri = this.activeCursorSuggestion.uri.toString()
                const closedUri = closedDocument.uri.toString()
                if (suggestionUri === closedUri) {
                    // Same editor, do nothing
                    return
                }

                this.hideNextCursorSuggestion()
            })
        )
    }

    public suggest(suggestion: CursorSuggestion): void {
        // Proxy through to the VS Code command so this can be easily adopted for Agent.
        vscode.commands.executeCommand('cody.nextCursor.suggest', suggestion)
    }

    public accept(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        // Proxy through to the VS Code command so this can be easily adopted for Agent.
        vscode.commands.executeCommand('cody.nextCursor.accept')
    }

    public discard(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        // Proxy through to the VS Code command so this can be easily adopted for Agent.
        vscode.commands.executeCommand('cody.nextCursor.discard')
    }

    private showNextCursorSuggestion(suggestion: CursorSuggestion): void {
        const editor = this.getEditorForUri(suggestion.uri)
        if (!editor) {
            return
        }

        this.activeCursorSuggestion = suggestion
        // We set VS Code state so we can override the Tab command to execute `cody.nextCursor.accept` instead.
        void vscode.commands.executeCommand('setContext', 'cody.nextCursorSuggested', true)
        editor.setDecorations(NEXT_CURSOR_DECORATION.decoration, [
            {
                range: new vscode.Range(suggestion.position.line, 0, suggestion.position.line, 0),
                renderOptions: NEXT_CURSOR_DECORATION.renderOptions,
            },
        ])
    }

    private acceptNextCursorSuggestion(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        const editor = this.getEditorForUri(this.activeCursorSuggestion.uri)
        if (!editor) {
            return
        }

        if (this.activeCursorSuggestion.hotStreakId) {
            // If we have a hot-streak ID attached to this suggestion, we need to ensure it is set in the request manager,
            // so that we can guarantee it will be retrieved in the next call to `provideInlineCompletionItems`.
            this.requestManager.lastAcceptedHotStreakId = this.activeCursorSuggestion.hotStreakId
        }

        editor.selection = new vscode.Selection(
            this.activeCursorSuggestion.position,
            this.activeCursorSuggestion.position
        )
        this.hideNextCursorSuggestion()
    }

    private hideNextCursorSuggestion(): void {
        if (!this.activeCursorSuggestion) {
            return
        }

        const cursorSuggestionUri = this.activeCursorSuggestion.uri

        // Reset cursor suggestion state so the Tab command will be used for accepting any auto-edit suggestions
        this.activeCursorSuggestion = null
        void vscode.commands.executeCommand('setContext', 'cody.nextCursorSuggested', false)

        // Attempt to clear the suggestion decoration if it hasn't already been cleared
        const editor = this.getEditorForUri(cursorSuggestionUri)
        if (!editor) {
            return
        }
        editor.setDecorations(NEXT_CURSOR_DECORATION.decoration, [])
    }

    private getEditorForUri(uri: vscode.Uri): vscode.TextEditor | undefined {
        return vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === uri.toString()
        )
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
