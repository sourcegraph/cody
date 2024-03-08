import { type AuthStatus, FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared'
import { type DebouncedFunc, throttle } from 'lodash'
import * as vscode from 'vscode'
import type { AuthProvider } from '../services/AuthProvider'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { execQueryWrapper } from '../tree-sitter/query-sdk'
import { getEditorInsertSpaces, getEditorTabSize } from '../utils'

const EDIT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Alt+K' : 'Opt+K'
const CHAT_SHORTCUT_LABEL = process.platform === 'win32' ? 'Alt+L' : 'Opt+L'
const DOC_SHORTCUT_LABEL = process.platform === 'win32' ? 'Alt+D' : 'Opt+D'

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
    const insertSpaces = getEditorInsertSpaces(document.uri)

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
    const tabSize = getEditorTabSize(document.uri)
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
    const settingValue = configSettings?.workspaceValue ?? configSettings?.globalValue

    // Return the actual configuration setting, if set. Otherwise return the default value from the feature flag.
    return {
        EditOrChat:
            settingValue ??
            (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyCommandHints)),
        Document:
            settingValue ??
            (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyDocumentHints)),
        /**
         * We're not running an A/B test on the "Opt+K" to generate text.
         * We can safely set the default of this to `true`.
         */
        Generate: settingValue ?? true,
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
        text: `${EDIT_SHORTCUT_LABEL} to Generate`,
        decoration: vscode.window.createTextEditorDecorationType({
            after: {
                color: GHOST_TEXT_COLOR,
                margin: '0 0 0 1em',
            },
        }),
    },
}

const GHOST_TEXT_THROTTLE = 250
const TELEMETRY_THROTTLE = 30 * 1000 // 30 Seconds

export class GhostHintDecorator implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private isActive = false
    private activeDecorationRange: vscode.Range | null = null
    private setThrottledGhostText: DebouncedFunc<typeof this.setGhostText>
    private fireThrottledDisplayEvent: DebouncedFunc<typeof this._fireDisplayEvent>

    /**
     * Tracks whether the user has recorded an enrollment for each ghost variant.
     * This is _only_ to help us measure usage via an A/B test.
     */
    private enrollmentRecorded: Record<Exclude<GhostVariant, 'Generate'>, boolean> = {
        EditOrChat: false,
        Document: false,
    }

    constructor(authProvider: AuthProvider) {
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
    }

    private init(enabledFeatures: EnabledFeatures): void {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(
                (event: vscode.TextEditorSelectionChangeEvent) => {
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

                    if (enabledFeatures.Document) {
                        const [documentableSymbol] = execQueryWrapper(
                            editor.document,
                            selection.active,
                            'getDocumentableNode'
                        )

                        if (documentableSymbol?.node) {
                            /**
                             * "Document" code flow.
                             * Display ghost text above the relevant symbol.
                             */
                            const precedingLine = Math.max(
                                0,
                                documentableSymbol.node.startPosition.row - 1
                            )
                            if (
                                this.activeDecorationRange &&
                                this.activeDecorationRange.start.line !== precedingLine
                            ) {
                                this.clearGhostText(editor)
                            }
                            this.firePossibleEnrollmentEvent('Document', enabledFeatures)
                            return this.setThrottledGhostText(
                                editor,
                                new vscode.Position(precedingLine, Number.MAX_VALUE),
                                'Document',
                                getSymbolDecorationPadding(
                                    editor.document,
                                    editor.document.lineAt(precedingLine),
                                    new vscode.Range(
                                        documentableSymbol.node.startPosition.row,
                                        documentableSymbol.node.startPosition.column,
                                        documentableSymbol.node.endPosition.row,
                                        documentableSymbol.node.endPosition.column
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

                        this.firePossibleEnrollmentEvent('EditOrChat', enabledFeatures)
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
            this.disposables.push(
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
                        return this.setGhostText(editor, new vscode.Position(0, 0), 'Generate')
                    }
                })
            )
        }
    }

    private setGhostText(
        editor: vscode.TextEditor,
        position: vscode.Position,
        variant: GhostVariant,
        textPadding = 0
    ): void {
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

    public clearGhostText(editor: vscode.TextEditor): void {
        this.setThrottledGhostText.cancel()
        this.activeDecorationRange = null
        Object.values(HINT_DECORATIONS).map(({ decoration }) => {
            editor.setDecorations(decoration, [])
        })
    }

    private _fireDisplayEvent(variant: GhostVariant): void {
        telemetryService.log('CodyVSCodeExtension:ghostText:visible', { variant })
        telemetryRecorder.recordEvent('cody.ghostText', 'visible', { privateMetadata: { variant } })
    }

    /**
     * Fire an additional telemetry enrollment event for when the user has hit a scenario where they would
     * trigger a possible ghost text variant.
     * This code is _only_ to be used to support the ongoing A/B tests for ghost hint usage.
     */
    private firePossibleEnrollmentEvent(variant: GhostVariant, enablement: EnabledFeatures): void {
        if (variant === 'Document' && !this.enrollmentRecorded.Document) {
            const testGroup = enablement.Document ? 'treatment' : 'control'
            telemetryService.log(
                'CodyVSCodeExtension:experiment:documentGhostText:enrolled',
                { variant: testGroup },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.experiment.documentGhostText', 'enrolled', {
                privateMetadata: { variant: testGroup },
            })
            // Mark this enrollment as recorded for the current session
            // We do not need to repeatedly mark the users' enrollment.
            this.enrollmentRecorded.Document = true
        }

        if (variant === 'EditOrChat' && !this.enrollmentRecorded.EditOrChat) {
            const testGroup = enablement.EditOrChat ? 'treatment' : 'control'
            telemetryService.log(
                'CodyVSCodeExtension:experiment:ghostText:enrolled',
                { variant: testGroup },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.experiment.ghostText', 'enrolled', {
                privateMetadata: { variant: testGroup },
            })
            // Mark this enrollment as recorded for the current session
            // We do not need to repeatedly mark the users' enrollment.
            this.enrollmentRecorded.EditOrChat = true
        }
    }

    private async updateEnablement(authStatus: AuthStatus): Promise<void> {
        const featureEnablement = await getGhostHintEnablement()
        if (
            !authStatus.isLoggedIn ||
            !(featureEnablement.Document || featureEnablement.EditOrChat || featureEnablement.Generate)
        ) {
            this.dispose()
            return
        }

        if (!this.isActive) {
            this.isActive = true
            this.init(featureEnablement)
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
