import {
    type AuthStatus,
    authStatus,
    contextFiltersProvider,
    currentAuthStatus,
    getEditorInsertSpaces,
    getEditorTabSize,
    isMacOS,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { type DebouncedFunc, throttle } from 'lodash'
import * as vscode from 'vscode'
import type { SyntaxNode } from 'web-tree-sitter'
import { execQueryWrapper } from '../tree-sitter/query-sdk'

const EDIT_SHORTCUT_LABEL = isMacOS() ? 'Opt+K' : 'Alt+K'
const CHAT_SHORTCUT_LABEL = isMacOS() ? 'Opt+L' : 'Alt+L'
const DOC_SHORTCUT_LABEL = isMacOS() ? 'Opt+D' : 'Alt+D'

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
 * Calculates padding to apply before and after the symbol decoration
 * to align it with the text on the insertion line.
 *
 * For this to work effectively, this makes some assumptions:
 * - The user has a monospace font
 * - Our decoration is the first, or only decoration to appear on this line.
 *
 * These are relatively safe assumptions to make. However, if they are wrong, it means the decoration may be misaligned.
 *
 * @param insertionLine - The line that the symbol decoration will be inserted on
 * @param symbolRange - The range of the symbol in the original location
 * @returns The number of spaces to pad the decoration by on insertion line
 */
function getSymbolDecorationPadding(
    document: vscode.TextDocument,
    insertionLine: vscode.TextLine,
    symbolRange: vscode.Range
): number {
    const insertSpaces = getEditorInsertSpaces(document.uri, vscode.workspace, vscode.window)

    if (insertSpaces) {
        const insertionEndCharacter = insertionLine.range.end.character
        const symbolAnchorCharacter =
            symbolRange.start.character > insertionEndCharacter
                ? symbolRange.start.character
                : symbolRange.end.character

        return Math.max(symbolAnchorCharacter - insertionEndCharacter, 2)
    }

    // This file is used tab-based indentation
    // We cannot rely on vscode.Range to provide the correct number of spaces required to align the symbol with the text.
    // We must first convert any tabs to spaces and then calculate the number of spaces required to align the symbol with the text.
    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
    const insertionEndCharacter = insertionLine.text
        .slice(0, insertionLine.range.end.character)
        .replaceAll(/\t/g, tabAsSpace).length

    const symbolAnchorPosition =
        symbolRange.start.character > insertionEndCharacter
            ? symbolRange.start.character
            : symbolRange.end.character
    const symbolAnchorCharacter = document
        .lineAt(symbolRange.start.line)
        .text.slice(0, symbolAnchorPosition)
        .replaceAll(/\t/g, tabAsSpace).length
    return Math.max(symbolAnchorCharacter - insertionEndCharacter, 2)
}

type GhostVariant = 'EditOrChat' | 'Document' | 'Generate'
type EnabledFeatures = Record<GhostVariant, boolean>

export async function getGhostHintEnablement(): Promise<EnabledFeatures> {
    const config = vscode.workspace.getConfiguration('cody')
    const configSettings = config.inspect<boolean>('commandHints.enabled')
    const settingValue = configSettings?.workspaceValue ?? configSettings?.globalValue ?? true

    // Return the actual configuration setting, if set. Otherwise return the default value from the feature flag.
    return {
        EditOrChat: settingValue,
        Document: settingValue,
        Generate: settingValue,
    }
}

const GHOST_TEXT_COLOR = new vscode.ThemeColor('editorGhostText.foreground')
const UNICODE_SPACE = '\u00a0'

/**
 * Decorations for showing a "ghost" hint to the user.
 *
 * Note: These needs to be created at extension run time as the order in which `createTextEditorDecorationType`
 * is called affects the ranking of the decoration - assuming multiple decorations.
 *
 * We should also ensure that `activationEvent` `onLanguage` is set to provide the best chance of
 * executing this code early, without impacting VS Code startup time.
 */
const HINT_DECORATIONS: Record<
    GhostVariant,
    { text: string; decoration: vscode.TextEditorDecorationType }
> = {
    EditOrChat: {
        text: `${EDIT_SHORTCUT_LABEL} to Edit, ${CHAT_SHORTCUT_LABEL} to Chat`,
        decoration: vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            after: {
                color: GHOST_TEXT_COLOR,
                margin: '0 0 0 1em',
            },
        }),
    },
    Document: {
        text: `${DOC_SHORTCUT_LABEL} to Document`,
        decoration: vscode.window.createTextEditorDecorationType({
            after: { color: GHOST_TEXT_COLOR },
        }),
    },
    Generate: {
        text: `${EDIT_SHORTCUT_LABEL} to Generate Code`,
        decoration: vscode.window.createTextEditorDecorationType({
            after: {
                color: GHOST_TEXT_COLOR,
                margin: '0 0 0 1em',
            },
        }),
    },
}

const DOCUMENTABLE_SYMBOL_THROTTLE = 10
const GHOST_TEXT_THROTTLE = 250
const TELEMETRY_THROTTLE = 30 * 1000 // 30 Seconds

export class GhostHintDecorator implements vscode.Disposable {
    // permanentDisposables are disposed when this instance is disposed.
    private permanentDisposables: vscode.Disposable[] = []

    // activeDisposables are disposed when the ghost hint is inactive (e.g., due to sign out)
    private activeDisposables: vscode.Disposable[] = []

    private isActive = false
    private activeDecorationRange: vscode.Range | null = null
    private setThrottledGhostText: DebouncedFunc<typeof this.setGhostText>
    private fireThrottledDisplayEvent: DebouncedFunc<typeof this._fireDisplayEvent>
    private getThrottledDocumentableSymbol: DebouncedFunc<typeof this.getDocumentableSymbol>

    /** Store the last line that the user typed on, we want to avoid showing the text here */
    private lastLineTyped: number | null = null

    constructor() {
        this.setThrottledGhostText = throttle(this.setGhostText.bind(this), GHOST_TEXT_THROTTLE, {
            leading: false,
            trailing: true,
        })
        this.fireThrottledDisplayEvent = throttle(
            this._fireDisplayEvent.bind(this),
            TELEMETRY_THROTTLE,
            {
                leading: true,
                trailing: false,
            }
        )
        this.getThrottledDocumentableSymbol = throttle(
            this.getDocumentableSymbol.bind(this),
            DOCUMENTABLE_SYMBOL_THROTTLE,
            {
                leading: true,
                trailing: true,
            }
        )

        // Listen to authentication changes
        this.permanentDisposables.push(
            subscriptionDisposable(authStatus.subscribe(authStatus => this.updateEnablement(authStatus)))
        )

        // Listen to configuration changes (e.g. if the setting is disabled)
        this.permanentDisposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('cody')) {
                    this.updateEnablement(currentAuthStatus())
                }
            }),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document !== vscode.window.activeTextEditor?.document) {
                    return
                }
                this.lastLineTyped = event.contentChanges[0]?.range.end.line ?? null
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                // Clear any stored line when switching to a new editor
                this.lastLineTyped = null
            })
        )
    }

    private init(enabledFeatures: EnabledFeatures): void {
        this.activeDisposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                async (event: vscode.TextEditorSelectionChangeEvent) => {
                    const editor = event.textEditor

                    if (editor.document.uri.scheme !== 'file') {
                        // Selection changed on a non-file document, e.g. (an output pane)
                        // Edit's aren't possible here, so do nothing
                        return
                    }

                    if (enabledFeatures.Generate && editor.document.getText().length === 0) {
                        this.clearGhostText(editor)
                        /**
                         * Generate code flow.
                         * Show immediately on the first line of empty files.
                         */
                        return this.setGhostText(editor, new vscode.Position(0, 0), 'Generate')
                    }

                    if (event.selections.length > 1) {
                        // Multiple selections, it will be confusing to show the ghost text on all of them, or just the first
                        // Clear existing text and avoid showing anything.
                        return this.clearGhostText(editor)
                    }

                    const selection = event.selections[0]

                    if (enabledFeatures.Document && selection.active.line !== this.lastLineTyped) {
                        const documentableSymbol = this.getThrottledDocumentableSymbol(
                            editor.document,
                            selection.active
                        )

                        if (documentableSymbol) {
                            /**
                             * "Document" code flow.
                             * Display ghost text above the relevant symbol.
                             */
                            const precedingLine = Math.max(0, documentableSymbol.startPosition.row - 1)
                            if (
                                this.activeDecorationRange &&
                                this.activeDecorationRange.start.line !== precedingLine
                            ) {
                                this.clearGhostText(editor)
                            }
                            return this.setThrottledGhostText(
                                editor,
                                new vscode.Position(precedingLine, Number.MAX_VALUE),
                                'Document',
                                getSymbolDecorationPadding(
                                    editor.document,
                                    editor.document.lineAt(precedingLine),
                                    new vscode.Range(
                                        documentableSymbol.startPosition.row,
                                        documentableSymbol.startPosition.column,
                                        documentableSymbol.endPosition.row,
                                        documentableSymbol.endPosition.column
                                    )
                                )
                            )
                        }
                    }

                    if (isEmptyOrIncompleteSelection(editor.document, selection)) {
                        // Empty or incomplete selection, we can technically do an edit/generate here but it is unlikely the user will want to do so.
                        // Clear existing text and avoid showing anything. We don't want the ghost text to spam the user too much.
                        return this.clearGhostText(editor)
                    }

                    if (enabledFeatures.EditOrChat) {
                        /**
                         * Sets the target position by determine the adjusted 'active' line filtering out any empty selected lines.
                         * Note: We adjust because VS Code will select the beginning of the next line when selecting a whole line.
                         */
                        const targetPosition = selection.isReversed
                            ? selection.active
                            : selection.active.translate(selection.end.character === 0 ? -1 : 0)

                        if (
                            this.activeDecorationRange &&
                            this.activeDecorationRange.start.line !== targetPosition.line
                        ) {
                            // Active decoration is incorrectly positioned, remove it before continuing
                            this.clearGhostText(editor)
                        }

                        /**
                         * Edit code flow.
                         * Show alongside a users' active selection
                         */
                        return this.setThrottledGhostText(editor, targetPosition, 'EditOrChat')
                    }
                }
            )
        )

        if (enabledFeatures.Generate) {
            this.activeDisposables.push(
                vscode.window.onDidChangeActiveTextEditor((editor?: vscode.TextEditor) => {
                    if (!editor) {
                        return
                    }

                    if (editor.document.uri.scheme !== 'file') {
                        // A non-file document, e.g. (an output pane)
                        // Edit's aren't possible here, so do nothing
                        return
                    }

                    if (editor.document.getText().length === 0) {
                        this.clearGhostText(editor)
                        /**
                         * Generate code flow.
                         * Show immediately on the first line of empty files.
                         */
                        return void this.setGhostText(editor, new vscode.Position(0, 0), 'Generate')
                    }
                })
            )
        }
    }

    private async setGhostText(
        editor: vscode.TextEditor,
        position: vscode.Position,
        variant: GhostVariant,
        textPadding = 0
    ): Promise<void> {
        if (await contextFiltersProvider.isUriIgnored(editor.document.uri)) {
            // The current file is ignored, so do nothing
            return
        }

        this.fireThrottledDisplayEvent(variant)

        const decorationHint = HINT_DECORATIONS[variant]
        const decorationText = UNICODE_SPACE.repeat(textPadding) + decorationHint.text
        this.activeDecorationRange = new vscode.Range(position, position)

        editor.setDecorations(HINT_DECORATIONS[variant].decoration, [
            {
                range: this.activeDecorationRange,
                renderOptions: { after: { contentText: decorationText } },
            },
        ])
    }

    private getDocumentableSymbol(
        document: vscode.TextDocument,
        position: vscode.Position
    ): SyntaxNode | undefined {
        const [documentableNode] = execQueryWrapper({
            document,
            position,
            queryWrapper: 'getDocumentableNode',
        })
        if (!documentableNode) {
            return
        }

        const {
            symbol: documentableSymbol,
            meta: { showHint },
        } = documentableNode
        if (!documentableSymbol || !showHint) {
            return
        }

        return documentableSymbol.node
    }

    public clearGhostText(editor: vscode.TextEditor): void {
        this.setThrottledGhostText.cancel()
        this.activeDecorationRange = null
        Object.values(HINT_DECORATIONS).map(({ decoration }) => {
            editor.setDecorations(decoration, [])
        })
    }

    private _fireDisplayEvent(variant: GhostVariant): void {
        telemetryRecorder.recordEvent('cody.ghostText', 'visible', { privateMetadata: { variant } })
    }

    private async updateEnablement(authStatus: AuthStatus): Promise<void> {
        const featureEnablement = await getGhostHintEnablement()
        if (
            !authStatus.authenticated ||
            !(featureEnablement.Document || featureEnablement.EditOrChat || featureEnablement.Generate)
        ) {
            this.disposeActive()
            return
        }

        if (!this.isActive) {
            this.isActive = true
            this.init(featureEnablement)
            return
        }
    }

    public dispose(): void {
        this.disposeActive()
        for (const d of this.permanentDisposables) {
            d.dispose()
        }
        this.permanentDisposables = []
    }

    private disposeActive(): void {
        this.isActive = false

        // Clear any existing ghost text
        if (vscode.window.activeTextEditor) {
            this.clearGhostText(vscode.window.activeTextEditor)
        }

        for (const disposable of this.activeDisposables) {
            disposable.dispose()
        }
        this.activeDisposables = []
    }
}
