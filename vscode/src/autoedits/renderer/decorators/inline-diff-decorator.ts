import * as vscode from 'vscode'
import type { AutoEditsDecorator, DecorationInfo } from './base'

export class InlineDiffDecorator implements vscode.Disposable, AutoEditsDecorator {
    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})

    constructor(private readonly editor: vscode.TextEditor) {}

    public setDecorations({ modifiedLines, removedLines }: DecorationInfo): void {
        const removedOptions = removedLines.map(({ originalLineNumber, text }) => {
            const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, text.length)
            return this.createRemovedDecoration(range, text.length)
        })

        const { added, removed } = this.createModifiedDecorationOptions(modifiedLines)

        this.editor.setDecorations(this.removedTextDecorationType, [...removedOptions, ...removed])
        this.editor.setDecorations(this.addedTextDecorationType, added)
    }

    /**
     * Process modified lines to create decorations for inserted and deleted text within those lines.
     */
    private createModifiedDecorationOptions(modifiedLines: DecorationInfo['modifiedLines']): {
        added: vscode.DecorationOptions[]
        removed: vscode.DecorationOptions[]
    } {
        const added: vscode.DecorationOptions[] = []
        const removed: vscode.DecorationOptions[] = []

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
                            added.push(
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
                        added.push(
                            this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                        )
                        currentInsertPosition = null
                        currentInsertText = ''
                    }

                    // Handle deletions within modified lines
                    if (change.type === 'delete') {
                        removed.push(
                            this.createRemovedDecoration(change.originalRange, change.text.length)
                        )
                    }
                }
            }

            // After processing all changes in the line, ensure the last insert group is added
            if (currentInsertPosition) {
                added.push(this.createGhostTextDecoration(currentInsertPosition, currentInsertText))
                currentInsertPosition = null
                currentInsertText = ''
            }

            // Apply removed changes for this line
            if (removed.length > 0) {
                this.editor.setDecorations(this.removedTextDecorationType, removed)
                removed.length = 0
            }
        }

        return { added, removed }
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
    }

    private clearDecorations(): void {
        this.editor.setDecorations(this.addedTextDecorationType, [])
        this.editor.setDecorations(this.removedTextDecorationType, [])
    }
}
