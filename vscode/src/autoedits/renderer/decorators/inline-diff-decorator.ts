import * as vscode from 'vscode'

import type { AutoEditsDecorator, DecorationInfo } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({
        // backgroundColor: 'rgba(50, 205, 50, 0.3)', // Light green background
    })

    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({
        // textDecoration: 'line-through',
    })

    constructor(private readonly editor: vscode.TextEditor) {}

    public setDecorations({ modifiedLines }: DecorationInfo): void {
        const removedRanges: vscode.DecorationOptions[] = []
        const addedRanges: vscode.DecorationOptions[] = []

        for (const line of modifiedLines) {
            // TODO(valery): verify that we still need to merge consecutive insertions.
            let currentInsertPosition: vscode.Position | null = null
            let currentInsertText = ''

            // Ignore line changes rendered as an inline completion item ghost text.
            for (const change of line.changes.filter(c => !c.usedAsInlineCompletion)) {
                if (change.type === 'insert') {
                    const position = change.range.end
                    if (currentInsertPosition && position.isEqual(currentInsertPosition)) {
                        // Same position as previous, accumulate the text
                        currentInsertText += change.text
                    } else {
                        // Different position or first insertion, push previous insert group if any
                        if (currentInsertPosition) {
                            addedRanges.push({
                                range: new vscode.Range(currentInsertPosition, currentInsertPosition),
                                renderOptions: {
                                    before: {
                                        contentText: currentInsertText,
                                        color: 'rgba(128, 128, 128, 0.5)', // Ghost text color
                                        margin: '0 0 0 0',
                                        fontStyle: 'italic',
                                    },
                                },
                            })
                        }
                        // Start a new insert group
                        currentInsertPosition = position
                        currentInsertText = change.text
                    }
                } else {
                    // Handle the end of an insert group
                    if (currentInsertPosition) {
                        addedRanges.push({
                            range: new vscode.Range(currentInsertPosition, currentInsertPosition),
                            renderOptions: {
                                before: {
                                    contentText: currentInsertText,
                                    color: 'rgba(128, 128, 128, 0.5)', // Ghost text color
                                    margin: '0 0 0 0',
                                    fontStyle: 'italic',
                                },
                            },
                        })
                        currentInsertPosition = null
                        currentInsertText = ''
                    }

                    // Handle deletions
                    if (change.type === 'delete') {
                        removedRanges.push({
                            range: change.range,
                            renderOptions: {
                                before: {
                                    contentText: '\u00A0'.repeat(change.text.length),
                                    backgroundColor: 'rgba(255,0,0,0.3)', // Red background for deletions
                                    margin: `0 -${change.text.length}ch 0 0`,
                                },
                            },
                        })
                    }
                }
            }

            // After processing all changes in the line, ensure the last insert group is added
            if (currentInsertPosition) {
                addedRanges.push({
                    range: new vscode.Range(currentInsertPosition, currentInsertPosition),
                    renderOptions: {
                        before: {
                            contentText: currentInsertText,
                            color: 'rgba(128, 128, 128, 0.5)', // Ghost text color
                            margin: '0 0 0 0',
                            fontStyle: 'italic',
                        },
                    },
                })
                currentInsertPosition = null
                currentInsertText = ''
            }
        }

        this.editor.setDecorations(this.removedTextDecorationType, removedRanges)
        this.editor.setDecorations(this.addedTextDecorationType, addedRanges)
    }

    private clearDecorations(): void {
        this.editor.setDecorations(this.addedTextDecorationType, [])
        this.editor.setDecorations(this.removedTextDecorationType, [])
    }

    public dispose(): void {
        this.clearDecorations()
        this.addedTextDecorationType.dispose()
        this.removedTextDecorationType.dispose()
    }
}
