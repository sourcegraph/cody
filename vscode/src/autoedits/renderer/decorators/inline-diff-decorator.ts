import * as vscode from 'vscode'
import { isOnlyAddingTextForModifiedLines } from '../diff-utils'
import { generateSuggestionAsImage } from '../image-gen'
import { getEndColumnForLine } from '../image-gen/utils'
import { makeVisualDiff } from '../visual-diff'
import type { AutoEditsDecorator, DecorationInfo } from './base'
import { cssPropertiesToString } from './utils'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly insertMarkerDecorationType = vscode.window.createTextEditorDecorationType({
        border: '1px dashed rgba(100, 255, 100, 0.5)',
        borderWidth: '1px 1px 0 0',
    })

    constructor(private readonly editor: vscode.TextEditor) {}

    public setDecorations(decorationInfo: DecorationInfo): void {
        const removedOptions = decorationInfo.removedLines.map(({ originalLineNumber, text }) => {
            const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, text.length)
            return this.createRemovedDecoration(range, text.length)
        })

        // TODO: Render insert marker?
        const removed = this.createModifiedRemovedDecorations(decorationInfo)
        const { added, insertMarker } = this.shouldRenderImage(decorationInfo)
            ? this.createModifiedImageDecorations(decorationInfo)
            : this.createModifiedAdditionDecorations(decorationInfo)

        this.editor.setDecorations(this.removedTextDecorationType, [...removedOptions, ...removed])
        this.editor.setDecorations(this.addedTextDecorationType, added)
        this.editor.setDecorations(this.insertMarkerDecorationType, insertMarker)
    }

    public canRenderDecoration(decorationInfo: DecorationInfo): boolean {
        // Inline decorator can render any decoration, so it should always return true.
        return true
    }

    private hasSimpleModifications(modifiedLines: DecorationInfo['modifiedLines']): boolean {
        if (isOnlyAddingTextForModifiedLines(modifiedLines)) {
            // We only have modified lines to show, and they are very simple.
            // We can render them as text.
            return false
        }

        let linesWithChanges = 0
        for (const modifiedLine of modifiedLines) {
            const changeCount = modifiedLine.changes.filter(
                change => change.type === 'delete' || change.type === 'insert'
            ).length

            if (changeCount === 0) {
                continue
            }

            if (changeCount >= 3) {
                // Three or more changes on a single line is classified as complex
                return false
            }

            linesWithChanges++
            if (linesWithChanges >= 3) {
                // Three or more lines with changes is classified as complex
                return false
            }
        }

        return true
    }

    private shouldRenderImage(decorationInfo: DecorationInfo): boolean {
        if (decorationInfo.addedLines.length > 0) {
            // Any additions should be represented with the image
            return true
        }

        if (this.hasSimpleModifications(decorationInfo.modifiedLines)) {
            // We a mixture of additions and deletions in the modified lines, but we are
            // classifying them as simple changes. We can render them as text.
            return false
        }

        return true
    }

    private createModifiedImageDecorations(decorationInfo: DecorationInfo): {
        added: vscode.DecorationOptions[]
        insertMarker: vscode.DecorationOptions[]
    } {
        // TODO: Diff mode will likely change depending on the environment.
        // This should be determined by client capabilities.
        // VS Code: 'additions'
        // Client capabiliies === image: 'unified'
        const diffMode = 'additions'
        const { diff, target } = makeVisualDiff(decorationInfo, diffMode, this.editor.document)
        const { dark, light, pixelRatio } = generateSuggestionAsImage({
            diff,
            lang: this.editor.document.languageId,
            mode: diffMode,
        })
        const startLineEndColumn = getEndColumnForLine(
            this.editor.document.lineAt(target.line),
            this.editor.document
        )

        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        // The margin position where the decoration image should render.
        // Ensuring it does not conflict with the visibility of existing code.
        const decorationMargin = target.offset - startLineEndColumn + decorationPadding
        const decorationStyle = cssPropertiesToString({
            // Absolutely position the suggested code so that the cursor does not jump there
            position: 'absolute',
            // Make sure the decoration is rendered on top of other decorations
            'z-index': '9999',
            // Scale the decoration to the correct size (upscaled to boost resolution)
            scale: String(1 / pixelRatio),
            'transform-origin': '0px 0px',
            height: 'auto',
            // The decoration will be entirely taken up by the image.
            // Setting the line-height to 0 ensures that there is no additional padding added by the decoration area.
            'line-height': '0',
        })

        return {
            added: [
                {
                    range: new vscode.Range(
                        target.line,
                        startLineEndColumn,
                        target.line,
                        startLineEndColumn
                    ),
                    renderOptions: {
                        before: {
                            color: new vscode.ThemeColor('editorSuggestWidget.foreground'),
                            backgroundColor: new vscode.ThemeColor('editorSuggestWidget.background'),
                            border: '1px solid',
                            borderColor: new vscode.ThemeColor('editorSuggestWidget.border'),
                            textDecoration: `none;${decorationStyle}`,
                            margin: `0 0 0 ${decorationMargin}ch`,
                        },
                        after: {
                            contentText: '\u00A0'.repeat(3) + '\u00A0'.repeat(startLineEndColumn),
                            margin: `0 0 0 ${decorationMargin}ch`,
                        },
                        // Provide different highlighting for dark/light themes
                        dark: { before: { contentIconPath: vscode.Uri.parse(dark) } },
                        light: { before: { contentIconPath: vscode.Uri.parse(light) } },
                    },
                },
            ],
            insertMarker: [{ range: new vscode.Range(target.line, 0, target.line, startLineEndColumn) }],
        }
    }

    private createModifiedAdditionDecorations(decorationInfo: DecorationInfo): {
        added: vscode.DecorationOptions[]
        insertMarker: vscode.DecorationOptions[]
    } {
        const { modifiedLines } = decorationInfo
        const decorations: vscode.DecorationOptions[] = []

        for (const line of modifiedLines) {
            // TODO(valery): verify that we still need to merge consecutive insertions.
            let currentInsertPosition: vscode.Position | null = null
            let currentInsertText = ''

            for (const change of line.changes) {
                if (change.type === 'insert') {
                    const position = change.originalRange.end
                    if (currentInsertPosition && position.isEqual(currentInsertPosition)) {
                        // Same position as previous, accumulate the text
                        currentInsertText += change.text
                    } else {
                        // Different position or first insertion, push previous insert group if any
                        if (currentInsertPosition) {
                            decorations.push(
                                this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                            )
                        }
                        // Start a new insert group
                        currentInsertPosition = position
                        currentInsertText = change.text
                    }
                } else {
                    // Handle the end of an insert group
                    if (currentInsertPosition) {
                        decorations.push(
                            this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                        )
                        currentInsertPosition = null
                        currentInsertText = ''
                    }
                }
            }

            // After processing all changes in the line, ensure the last insert group is added
            if (currentInsertPosition) {
                decorations.push(
                    this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                )
                currentInsertPosition = null
                currentInsertText = ''
            }
        }

        return {
            added: decorations,
            // No need to render an insert marker, it's clear exactly where the changes are
            insertMarker: [],
        }
    }

    private createModifiedRemovedDecorations(
        decorationInfo: DecorationInfo
    ): vscode.DecorationOptions[] {
        const { modifiedLines } = decorationInfo
        const decorations: vscode.DecorationOptions[] = []

        for (const line of modifiedLines) {
            for (const change of line.changes) {
                if (change.type === 'delete') {
                    decorations.push(
                        this.createRemovedDecoration(change.originalRange, change.text.length)
                    )
                }
            }
        }

        return decorations
    }

    /**
     * Create a ghost text decoration at the given position.
     */
    private createGhostTextDecoration(
        position: vscode.Position,
        text: string
    ): vscode.DecorationOptions {
        return {
            range: new vscode.Range(position, position),
            renderOptions: {
                before: {
                    color: 'rgba(128, 128, 128, 0.5)', // ghost text color
                    margin: '0 0 0 0',
                    fontStyle: 'italic',
                    contentText: text,
                },
            },
        }
    }

    /**
     * A helper to create a removed text decoration for a given range and text length.
     * Both entire line removals and inline deletions use this logic.
     */
    private createRemovedDecoration(range: vscode.Range, textLength: number): vscode.DecorationOptions {
        return {
            range,
            renderOptions: {
                before: {
                    contentText: '\u00A0'.repeat(textLength),
                    backgroundColor: 'rgba(255,0,0,0.3)', // red background for deletions
                    margin: `0 -${textLength}ch 0 0`,
                },
            },
        }
    }

    public dispose(): void {
        this.clearDecorations()
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
        this.insertMarkerDecorationType.dispose()
    }

    private clearDecorations(): void {
        this.editor.setDecorations(this.addedTextDecorationType, [])
        this.editor.setDecorations(this.removedTextDecorationType, [])
        this.editor.setDecorations(this.insertMarkerDecorationType, [])
    }
}
