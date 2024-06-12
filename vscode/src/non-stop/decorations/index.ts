import * as vscode from 'vscode'

import type { FixupFile } from '../FixupFile'
import type { FixupTask } from '../FixupTask'
import {
    type ComputedOutput,
    type Decorations,
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

    public dispose(): void {}

    public async didChangeVisibleTextEditors(file: FixupFile): Promise<void> {
        this.applyDecorations(file, this.tasksWithDecorations.get(file)?.values() || [].values())
    }

    public didUpdateInProgressReplacement(task: FixupTask): void {
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

    public didUpdateDiff(task: FixupTask): void {
        const taskOutput = computeFinalDecorations(task)
        this.updateTaskDecorations(task, taskOutput)
    }

    public async didApplyTask(task: FixupTask): Promise<void> {
        const taskOutput = computeFinalDecorations(task)
        this.updateTaskDecorations(task, taskOutput)
    }

    public async didCompleteTask(task: FixupTask): Promise<void> {
        this.updateTaskDecorations(task, null)
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
}
