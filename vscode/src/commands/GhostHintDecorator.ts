import { throttle, type DebouncedFunc } from 'lodash'
import * as vscode from 'vscode'

const EDIT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Ctrl+K' : 'Cmd+K'
const CHAT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Ctrl+L' : 'Cmd+L'

/**
 * Checks if the given selection in the document is an incomplete line selection.
 * @param document - The text document containing the selection
 * @param selection - The selection to check
 * @returns boolean - True if the selection does not contain the full range of non-whitespace characters on the line
 */
function isEmptyOrIncompleteSelection(
    document: vscode.TextDocument,
    selection: vscode.Selection
): boolean {
    if (selection.isEmpty) {
        // Nothing to select
        return true
    }

    if (!selection.isSingleLine) {
        // Multi line selections are always considered complete
        return false
    }

    const line = document.lineAt(selection.start.line)
    // Return `true` (incomplete selection) if the selection does not contain the full range of non-whitespace characters on the line
    return (
        line.firstNonWhitespaceCharacterIndex < selection.start.character ||
        line.range.end.character > selection.end.character
    )
}

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
        this.throttledSetGhostText = throttle(this.setGhostText.bind(this), 250, {
            leading: false,
            trailing: true,
        })
        this.updateConfig()
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.updateConfig()
            }
        })
    }

    private init(): void {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                (event: vscode.TextEditorSelectionChangeEvent) => {
                    const editor = event.textEditor

                    if (!event.kind || event.kind === vscode.TextEditorSelectionChangeKind.Command) {
                        // The selection event was likely triggered programatically, or via another action (e.g. search)
                        // It's unlikely the user would want to trigger an edit here, so clear any existing text and return early.
                        return this.clearGhostText(editor)
                    }

                    const selection = event.selections[0]
                    if (isEmptyOrIncompleteSelection(editor.document, selection)) {
                        // Empty or incomplete selection, we can technically do an edit/generate here but it is unlikely the user will want to do so.
                        // Clear existing text and avoid showing anything. We don't want the ghost text to spam the user too much.
                        return this.clearGhostText(editor)
                    }

                    /**
                     * Sets the target position by determine the adjusted 'active' line filtering out any empty selected lines.
                     * Note: We adjust because VS Code will select the beginning of the next line when selecting a whole line.
                     */
                    const targetPosition = selection.isReversed
                        ? selection.active
                        : selection.active.translate(selection.end.character === 0 ? -1 : 0)

                    if (
                        this.activeDecoration &&
                        this.activeDecoration.range.start.line !== targetPosition.line
                    ) {
                        // Active decoration is incorrectly positioned, remove it before continuing
                        this.clearGhostText(editor)
                    }

                    // Edit code flow, throttled show to avoid spamming whilst the user makes an active selection
                    return this.throttledSetGhostText(editor, targetPosition)
                }
            )
        )
    }

    private setGhostText(editor: vscode.TextEditor, position: vscode.Position): void {
        this.activeDecoration = {
            range: new vscode.Range(position, position),
            renderOptions: {
                after: { contentText: `${EDIT_SHORTCUT_LABEL} to Edit, ${CHAT_SHORTCUT_LABEL} to Chat` },
            },
        }
        editor.setDecorations(ghostHintDecoration, [this.activeDecoration])
    }

    public clearGhostText(editor: vscode.TextEditor): void {
        this.throttledSetGhostText.cancel()
        this.activeDecoration = null
        editor.setDecorations(ghostHintDecoration, [])
    }

    private updateConfig(): void {
        const config = vscode.workspace.getConfiguration('cody')
        const isEnabled = config.get('internal.unstable') as boolean

        if (!isEnabled) {
            this.dispose()
            return
        }

        if (isEnabled && !this.isActive) {
            this.isActive = true
            this.init()
            return
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
