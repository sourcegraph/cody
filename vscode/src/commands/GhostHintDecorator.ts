import { throttle, type DebouncedFunc } from 'lodash'
import * as vscode from 'vscode'

const EDIT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Ctrl+K' : 'Cmd+K'
const CHAT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Ctrl+L' : 'Cmd+L'

/**
 * Creates a new decoration for showing a "ghost" hint to the user.
 *
 * Note: This needs to be created at extension run time as the order in which `createTextEditorDecorationType`
 * is called affects the ranking of the decoration - assuming multiple decorations.
 *
 * We should also ensure that `activationEvent` `onLanguage` is set to provide the best chance of
 * executing this code early, without impacting VS Code startup time.
 */
export const ghostHintDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    after: {
        color: new vscode.ThemeColor('editorGhostText.foreground'),
        margin: '0 0 0 1em',
    },
})

export class GhostHintDecorator implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private isActive = false
    private activeDecoration: vscode.DecorationOptions | null = null
    private throttledSetGhostText: DebouncedFunc<typeof this.setGhostText>

    constructor() {
        this.throttledSetGhostText = throttle(this.setGhostText.bind(this), 250, { leading: false, trailing: true })
        this.updateConfig()
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.updateConfig()
            }
        })
    }

    private init(): void {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
                const editor = event.textEditor
                const firstSelection = event.selections[0]

                if (firstSelection.isEmpty && !editor.document.lineAt(firstSelection.start.line).isEmptyOrWhitespace) {
                    // Empty selection but non-empty line, so we don't show a message to avoid spamming the user with text.
                    this.clearGhostText(editor)
                    return
                }

                /**
                 * Sets the target position by determine the adjusted 'active' line filtering out any empty selected lines.
                 * Note: We adjust because VS Code will select the beginning of the next line when selecting a whole line.
                 */
                const targetPosition = firstSelection.isReversed
                    ? firstSelection.active
                    : firstSelection.active.translate(firstSelection.end.character === 0 ? -1 : 0)

                if (this.activeDecoration && this.activeDecoration.range.start.line !== targetPosition.line) {
                    // Selection changed, remove existing decoration
                    this.clearGhostText(editor)
                }

                const ghostText = `${EDIT_SHORTCUT_LABEL} to ${
                    firstSelection.isEmpty ? 'Generate' : 'Edit'
                }, ${CHAT_SHORTCUT_LABEL} to Chat`

                if (firstSelection.isEmpty) {
                    // Generate code flow, cancel any pending edit flow and show new text immediately
                    this.throttledSetGhostText.cancel()
                    return this.setGhostText(editor, targetPosition, ghostText)
                }

                // Edit code flow, throttled show to avoid spamming whilst the user makes an active selection
                return this.throttledSetGhostText(editor, targetPosition, ghostText)
            })
        )
    }

    private setGhostText(editor: vscode.TextEditor, position: vscode.Position, text: string): void {
        this.activeDecoration = {
            range: new vscode.Range(position, position),
            renderOptions: { after: { contentText: text } },
        }
        editor.setDecorations(ghostHintDecoration, [this.activeDecoration])
    }

    private clearGhostText(editor: vscode.TextEditor): void {
        this.throttledSetGhostText.cancel()
        this.activeDecoration = null
        editor.setDecorations(ghostHintDecoration, [])
    }

    private updateConfig(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const isEnabled = config.get('internal.ghostHints') as boolean

        if (!isEnabled) {
            return this.dispose()
        }

        if (isEnabled && !this.isActive) {
            this.isActive = true
            return this.init()
        }
    }

    public dispose(): void {
        this.isActive = false
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
