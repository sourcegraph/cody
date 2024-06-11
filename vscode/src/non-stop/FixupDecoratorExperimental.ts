import * as vscode from 'vscode'

import { diffLines } from 'diff'
import type { FixupFile } from './FixupFile'
import type { FixupTask } from './FixupTask'

const INSERTED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
})

const REMOVED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
})

const UNICODE_SPACE = '\u00a0'

interface Decorations {
    added: vscode.DecorationOptions[]
    removed: vscode.DecorationOptions[]
}
type PlaceholderLines = number[]

interface ComputedOutput {
    decorations: Decorations
    placeholderLines: PlaceholderLines
}

function computeTaskOutput(task: FixupTask): ComputedOutput | null {
    if (!task.replacement) {
        return null
    }

    let startLine = task.selectionRange.start.line
    const placeholderLines: PlaceholderLines = []
    const decorations: Decorations = {
        added: [],
        removed: [],
    }

    const diff = diffLines(task.original, task.replacement)
    for (const change of diff) {
        const lines = change.value.split('\n').filter(Boolean)
        if (change.removed) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                // Get leading whitespace for line
                const padding = (line.match(/^\s*/)?.[0] || '').length
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.removed.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                    renderOptions: {
                        after: { contentText: UNICODE_SPACE.repeat(padding) + line.trim() },
                    },
                })
                placeholderLines.push(startLine)
                startLine++
            }
        } else if (change.added) {
            for (let i = 0; i < lines.length; i++) {
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.added.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                })
                startLine++
            }
        } else {
            // unchanged line
            startLine += lines.length
        }
    }

    return { decorations, placeholderLines }
}

export class FixupDecoratorExperimental implements vscode.Disposable {
    private tasksWithDecorations: Map<FixupFile, Map<FixupTask, Decorations>> = new Map()
    private tasksWithPlaceholders: Map<FixupFile, Map<FixupTask, PlaceholderLines>> = new Map()

    public dispose(): void {}

    public async didChangeVisibleTextEditors(
        file: FixupFile,
        editors: vscode.TextEditor[]
    ): Promise<void> {
        await this.applyPlaceholders(file, this.tasksWithPlaceholders.get(file)?.values() || [].values())
        this.applyDecorations(file, this.tasksWithDecorations.get(file)?.values() || [].values())
    }

    public didUpdateDiff(task: FixupTask): void {
        // this.updateTaskPlaceholders(task, taskOutput)
        // this.updateTaskDecorations(task, task.diff)
    }

    public async didApplyTask(task: FixupTask): Promise<void> {
        console.log('CALLED DID APPLY')
        const taskOutput = computeTaskOutput(task)
        await this.updateTaskPlaceholders(task, taskOutput)
        this.updateTaskDecorations(task, taskOutput)
    }

    public async didCompleteTask(task: FixupTask): Promise<void> {
        console.log('CALLED DID COMPLETE')
        await this.updateTaskPlaceholders(task, null)
        this.updateTaskDecorations(task, null)
    }

    private async updateTaskPlaceholders(task: FixupTask, output: ComputedOutput | null): Promise<void> {
        const isEmpty = !output || output.placeholderLines.length === 0

        let filePlaceholders = this.tasksWithPlaceholders.get(task.fixupFile)
        if (!filePlaceholders && isEmpty) {
            // The file has no placeholder lines, do nothing
            return
        }

        if (isEmpty) {
            const placeholders = filePlaceholders?.get(task)
            console.log('GOT')
            if (placeholders) {
                // There were old placeholder lines; remove them.
                filePlaceholders?.delete(task)
                console.log('REMOVED')
                await this.removePlaceholders(task.fixupFile, placeholders.values())
            }
            return
        }

        if (!filePlaceholders) {
            // Create the map to hold this file's decorations.
            filePlaceholders = new Map()
            this.tasksWithPlaceholders.set(task.fixupFile, filePlaceholders)
        }
        filePlaceholders.set(task, output.placeholderLines)
        await this.applyPlaceholders(task.fixupFile, filePlaceholders.values())
    }

    private updateTaskDecorations(task: FixupTask, output: ComputedOutput | null): void {
        const isEmpty =
            !output || (output.decorations.added.length === 0 && output.decorations.removed.length === 0)

        let fileDecorations = this.tasksWithDecorations.get(task.fixupFile)
        if (!fileDecorations && isEmpty) {
            // The file was not decorated; we have no decorations. Do nothing.
            return
        }

        if (isEmpty) {
            if (fileDecorations?.has(task)) {
                // There were old decorations; remove them.
                fileDecorations.delete(task)
                this.applyDecorations(task.fixupFile, fileDecorations.values())
            }
            return
        }

        if (!fileDecorations) {
            // Create the map to hold this file's decorations.
            fileDecorations = new Map()
            this.tasksWithDecorations.set(task.fixupFile, fileDecorations)
        }

        fileDecorations.set(task, output.decorations)
        this.applyDecorations(task.fixupFile, fileDecorations.values())
    }

    private applyDecorations(
        file: FixupFile,
        tasksWithDecorations: IterableIterator<Decorations>
    ): void {
        const addedDecorations = []
        const removedDecorations = []
        for (const decorations of tasksWithDecorations) {
            addedDecorations.push(...decorations.added)
            removedDecorations.push(...decorations.removed)
        }

        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === file.uri
        )
        for (const editor of editors) {
            editor.setDecorations(INSERTED_CODE_DECORATION, addedDecorations)
            editor.setDecorations(REMOVED_CODE_DECORATION, removedDecorations)
        }
    }

    private async applyPlaceholders(
        file: FixupFile,
        tasksWithPlaceholders: IterableIterator<PlaceholderLines>
    ): Promise<void> {
        console.log('APPLYING PLACEHOLDERS...')
        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === file.uri
        )

        for (const editor of editors) {
            for (const placeholders of tasksWithPlaceholders) {
                for (const line of placeholders) {
                    await editor.edit(
                        editBuilder => {
                            editBuilder.insert(new vscode.Position(line, 0), '\n')
                        },
                        { undoStopAfter: false, undoStopBefore: false }
                    )
                }
            }
        }
    }

    private async removePlaceholders(
        file: FixupFile,
        placeholderLines: IterableIterator<number>
    ): Promise<void> {
        console.log('REMOVING PLACEHOLDERS...')
        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === file.uri
        )

        for (const editor of editors) {
            await editor.edit(
                editBuilder => {
                    for (const line of placeholderLines) {
                        const fullLine = editor.document.lineAt(line)
                        console.log('Removing line:', line)
                        editBuilder.delete(fullLine.rangeIncludingLineBreak)
                    }
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
        }
    }
}
