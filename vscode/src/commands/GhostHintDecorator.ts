import { throttle, type DebouncedFunc } from 'lodash'
import * as vscode from 'vscode'
import type { AuthProvider } from '../services/AuthProvider'
import type { AuthStatus } from '../chat/protocol'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared'
import { isGenerateIntent } from '../edit/utils/edit-intent'

const EDIT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Alt+K' : 'Opt+K'
const CHAT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Alt+L' : 'Opt+L'

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

export async function getGhostHintEnablement(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('cody')
    const configSettings = config.inspect<boolean>('commandHints.enabled')

    // Return the actual configuration setting, if set. Otherwise return the default value from the feature flag.
    return (
        configSettings?.workspaceValue ??
        configSettings?.globalValue ??
        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyCommandHints)
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
        textDecoration: 'none; opacity: 0.5;',
    },
})

// Adjust as needed
const GHOST_TEXT_DEBOUNCE = 250

export class GhostHintDecorator implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private isActive = false
    private activeDecoration: vscode.DecorationOptions | null = null
    private throttledSetGhostText: DebouncedFunc<typeof this.setGhostText>

    /** Store the last line that the user typed on, we want to avoid showing the text here */
    private lastLineTyped: number | null = null

    constructor(authProvider: AuthProvider) {
        this.throttledSetGhostText = throttle(this.setGhostText.bind(this), GHOST_TEXT_DEBOUNCE, {
            leading: false,
            trailing: true,
        })

        // Set initial state, based on the configuration and authentication status
        const initialAuth = authProvider.getAuthStatus()
        this.updateEnablement(initialAuth)

        // Listen to authentication changes
        authProvider.addChangeListener(authStatus => this.updateEnablement(authStatus))

        // Listen to configuration changes (e.g. if the setting is disabled)
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.updateEnablement(authProvider.getAuthStatus())
            }
        })

        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document !== vscode.window.activeTextEditor?.document) {
                // TODO: Handle this better
                return
            }

            // TODO: Should we track multiple lines if there's multiple changes?
            const firstChange = event.contentChanges[0]

            this.lastLineTyped = firstChange ? firstChange.range.end.line : null
        })
    }

    private init(): void {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                (event: vscode.TextEditorSelectionChangeEvent) => {
                    const editor = event.textEditor

                    if (editor.document.uri.scheme !== 'file') {
                        // Selection changed on a non-file document, e.g. (an output pane)
                        // Edit's aren't possible here, so do nothing
                        return
                    }

                    if (event.selections.length > 1) {
                        // Multiple selections, it will be confusing to show the ghost text on all of them, or just the first
                        // Clear existing text and avoid showing anything.
                        return this.clearGhostText(editor)
                    }

                    const selection = event.selections[0]

                    /**
                     * Sets the target position by determine the adjusted 'active' line filtering out any empty selected lines.
                     * Note: We adjust because VS Code will select the beginning of the next line when selecting a whole line.
                     */
                    const targetPosition = selection.isReversed
                        ? selection.active
                        : selection.active.translate(selection.end.character === 0 ? -1 : 0)

                    if (targetPosition.line === this.lastLineTyped) {
                        // We are targeting the line where the user is typing, do nothing here.
                        return this.clearGhostText(editor)
                    }

                    if (
                        this.activeDecoration &&
                        this.activeDecoration.range.start.line !== targetPosition.line
                    ) {
                        // Active decoration is incorrectly positioned, remove it before continuing
                        this.clearGhostText(editor)
                    }

                    if (isGenerateIntent(editor.document, selection)) {
                        this.clearGhostText(editor)
                        return this.setGhostText(editor, targetPosition, 'Generate')
                    }

                    if (selection.start.line !== selection.end.line) {
                        // Multi line selection, so let's use the throttled function here so the user might be actively adjusting the selection
                        return this.throttledSetGhostText(editor, targetPosition)
                    }

                    // Not generate, not a multi-line selection, show "Edit" hint immediately
                    return this.setGhostText(editor, targetPosition)
                }
            )
        )
    }

    private setGhostText(editor: vscode.TextEditor, position: vscode.Position, editVerb = 'Edit'): void {
        this.activeDecoration = {
            range: new vscode.Range(position, position),
            renderOptions: {
                after: {
                    contentText: `\u00a0\u00a0\u00a0${EDIT_SHORTCUT_LABEL} to ${editVerb}, ${CHAT_SHORTCUT_LABEL} to Chat`,
                },
            },
        }
        editor.setDecorations(ghostHintDecoration, [this.activeDecoration])
    }

    public clearGhostText(editor: vscode.TextEditor): void {
        this.throttledSetGhostText.cancel()
        this.activeDecoration = null
        editor.setDecorations(ghostHintDecoration, [])
    }

    private async updateEnablement(authStatus: AuthStatus): Promise<void> {
        const featureEnabled = await getGhostHintEnablement()

        if (!authStatus.isLoggedIn || !featureEnabled) {
            this.dispose()
            return
        }

        if (!this.isActive) {
            this.isActive = true
            this.init()
            return
        }
    }

    public dispose(): void {
        this.isActive = false

        // Clear any existing ghost text
        if (vscode.window.activeTextEditor) {
            this.clearGhostText(vscode.window.activeTextEditor)
        }

        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
