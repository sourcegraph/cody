import { throttle } from 'lodash'
import * as vscode from 'vscode'

const WINDOWS_LABEL = 'Ctrl+K to Edit, Ctrl+L to Chat'
const MACOS_LABEL = '⌘K to Edit, ⌘L to Chat'

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
        contentText: process.platform === 'win32' ? WINDOWS_LABEL : MACOS_LABEL,
        color: new vscode.ThemeColor('editorGhostText.foreground'),
        margin: '0 0 0 1em',
    },
})

export class GhostHintDecorator implements vscode.Disposable {
    private isActive = false
    private disposables: vscode.Disposable[] = []
    private activeDecoration: vscode.DecorationOptions | null = null

    constructor() {
        this.updateConfig()
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.updateConfig()
            }
        })
    }

    private init(): void {
        const setGhostText = throttle(
            (position: vscode.Position, editor: vscode.TextEditor) => {
                this.activeDecoration = { range: new vscode.Range(position, position) }
                editor.setDecorations(ghostHintDecoration, [this.activeDecoration])
            },
            250,
            { leading: false, trailing: true }
        )

        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
                const editor = event.textEditor
                const firstSelection = event.selections[0]

                if (firstSelection.isEmpty) {
                    // Nothing selected, clear existing
                    this.activeDecoration = null
                    return editor.setDecorations(ghostHintDecoration, [])
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
                    this.activeDecoration = null
                    editor.setDecorations(ghostHintDecoration, [])
                }

                setGhostText(targetPosition, editor)
            })
        )
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
