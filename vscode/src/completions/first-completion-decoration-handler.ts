import * as vscode from 'vscode'

import type { RequestParams } from './request-manager'

/**
 * Handles showing an in-editor decoration when a first completion is accepted.
 */
export class FirstCompletionDecorationHandler {
    /**
     * Duration to show decoration before automatically hiding.
     *
     * Modifying the document will also immediately hide.
     */
    private static readonly decorationDurationMilliseconds = 10000

    /**
     * A subscription watching for file changes to automatically hide the decoration.
     *
     * This subscription will be cancelled once the decoration is hidden (for any reason).
     */
    private editorChangeSubscription: vscode.Disposable | undefined

    /**
     * A timer to hide the decoration automatically.
     */
    private hideTimer: NodeJS.Timeout | undefined

    private readonly decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            margin: '0 0 0 40px',
            contentText: '    🎉 You just accepted your first Cody autocomplete!',
            color: new vscode.ThemeColor('editorGhostText.foreground'),
        },
        isWholeLine: true,
    })

    /**
     * Shows the decoration if the editor is still active.
     */
    public show(request: RequestParams): void {
        // We need an editor to show decorations. We don't want to blindly open request.document
        // if somehow it's no longer active, so check if the current active editor is the right
        // one. It's almost certainly the case.
        const editor = vscode.window.activeTextEditor
        if (editor?.document !== request.document) {
            return
        }

        // Show the decoration at the position of the completion request. Because we set isWholeLine=true
        // it'll always be shown at the end of this line, regardless of the length of the completion.
        editor.setDecorations(this.decorationType, [
            new vscode.Range(request.position, request.position),
        ])

        // Hide automatically after a time..
        this.hideTimer = setTimeout(
            () => this.hide(editor),
            FirstCompletionDecorationHandler.decorationDurationMilliseconds
        )

        // But also listen for changes to automatically hide if the user starts typing so that we're never
        // in the way.
        //
        // We should never be called twice, but just in case dispose any existing sub to ensure we don't leak.
        this.editorChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === editor.document) {
                this.hide(editor)
            }
        })
    }

    /**
     * Hides the decoration and clears any active subscription/timeout.
     */
    private hide(editor: vscode.TextEditor): void {
        clearTimeout(this.hideTimer)
        this.editorChangeSubscription?.dispose()
        editor.setDecorations(this.decorationType, [])
    }
}
