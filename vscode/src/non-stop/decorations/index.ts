import * as vscode from 'vscode'

import type { FixupFile } from '../FixupFile'
import type { FixupTask } from '../FixupTask'
import {
    type ComputedOutput,
    type Decorations,
    type PlaceholderLines,
    computeFinalDecorations,
    computeOngoingDecorations,
} from './compute-decorations'
import {
    CURRENT_LINE_DECORATION,
    INSERTED_CODE_DECORATION,
    REMOVED_CODE_DECORATION,
    UNVISITED_LINE_DECORATION,
} from './constants'

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
        const previouslyComputed = this.tasksWithDecorations.get(task.fixupFile)?.get(task)
        const taskOutput = computeOngoingDecorations(task, previouslyComputed)

        if (
            previouslyComputed &&
            taskOutput &&
            previouslyComputed.currentLine === taskOutput?.decorations.currentLine
        ) {
            // The current line has not changed, so we can skip updating the decorations.
            return
        }

        this.updateTaskDecorations(task, taskOutput)
    }

    public async didApplyTask(task: FixupTask): Promise<void> {
        const taskOutput = computeFinalDecorations(task)
        await this.updateTaskPlaceholders(task, taskOutput)
        this.updateTaskDecorations(task, taskOutput)
    }

    public async didFormatTask(task: FixupTask): Promise<void> {
        const filePlaceholders = this.tasksWithPlaceholders.get(task.fixupFile)
        const taskPlaceholders = filePlaceholders?.get(task)
        if (taskPlaceholders) {
            // Remove existing placeholders before applying them again, this is so we don't
            // get duplicate placeholder lines if the formatting changed the code
            filePlaceholders?.delete(task)
            await this.removePlaceholders(task.fixupFile, taskPlaceholders.values())
        }
        const taskOutput = computeFinalDecorations(task)
        await this.updateTaskPlaceholders(task, taskOutput)
        this.updateTaskDecorations(task, taskOutput)
    }

    public async didCompleteTask(task: FixupTask): Promise<void> {
        await this.updateTaskPlaceholders(task, null)
        this.updateTaskDecorations(task, null)
    }

    private async updateTaskPlaceholders(task: FixupTask, output: ComputedOutput | null): Promise<void> {
        const isEmpty = !output || (output.placeholderLines || []).length === 0

        let filePlaceholders = this.tasksWithPlaceholders.get(task.fixupFile)
        if (!filePlaceholders && isEmpty) {
            // The file has no placeholder lines, do nothing
            return
        }

        if (isEmpty) {
            const placeholders = filePlaceholders?.get(task)
            if (placeholders) {
                // There were old placeholder lines; remove them.
                filePlaceholders?.delete(task)
                await this.removePlaceholders(task.fixupFile, placeholders.values())
            }
            return
        }

        if (!filePlaceholders) {
            // Create the map to hold this file's decorations.
            filePlaceholders = new Map()
            this.tasksWithPlaceholders.set(task.fixupFile, filePlaceholders)
        }
        filePlaceholders.set(task, output.placeholderLines || [])
        await this.applyPlaceholders(task.fixupFile, filePlaceholders.values())
    }

    private updateTaskDecorations(task: FixupTask, output: ComputedOutput | null): void {
        const isEmpty =
            !output ||
            (output.decorations.linesAdded.length === 0 &&
                output.decorations.linesRemoved.length === 0 &&
                output.decorations.unvisitedLines.length === 0 &&
                !output.decorations.currentLine)

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
        const currentLineDecorations = []
        const unvisitedLinesDecorations = []
        const addedDecorations = []
        const removedDecorations = []
        for (const decorations of tasksWithDecorations) {
            if (decorations.currentLine) {
                currentLineDecorations.push(decorations.currentLine)
            }
            unvisitedLinesDecorations.push(...decorations.unvisitedLines)
            addedDecorations.push(...decorations.linesAdded)
            removedDecorations.push(...decorations.linesRemoved)
        }

        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === file.uri
        )
        for (const editor of editors) {
            editor.setDecorations(CURRENT_LINE_DECORATION, currentLineDecorations)
            editor.setDecorations(UNVISITED_LINE_DECORATION, unvisitedLinesDecorations)
            editor.setDecorations(INSERTED_CODE_DECORATION, addedDecorations)
            editor.setDecorations(REMOVED_CODE_DECORATION, removedDecorations)
        }
    }

    private async applyPlaceholders(
        file: FixupFile,
        tasksWithPlaceholders: IterableIterator<PlaceholderLines>
    ): Promise<void> {
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
        const editors = vscode.window.visibleTextEditors.filter(
            editor => editor.document.uri === file.uri
        )

        for (const editor of editors) {
            await editor.edit(
                editBuilder => {
                    for (const line of placeholderLines) {
                        const fullLine = editor.document.lineAt(line)
                        editBuilder.delete(fullLine.rangeIncludingLineBreak)
                    }
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
        }
    }
}
