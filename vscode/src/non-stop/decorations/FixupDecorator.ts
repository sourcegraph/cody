import * as vscode from 'vscode'

import type { FixupFile } from '../FixupFile'
import type { FixupTask } from '../FixupTask'
import {
    type Decorations,
    computeAppliedDecorations,
    computeOngoingDecorations,
} from './compute-decorations'
import {
    CURRENT_LINE_DECORATION,
    INSERTED_CODE_DECORATION,
    REMOVED_CODE_DECORATION,
    UNVISITED_LINE_DECORATION,
} from './constants'

export class FixupDecorator {
    private tasksWithDecorations: Map<FixupFile, Map<FixupTask, Decorations>> = new Map()

    public didChangeVisibleTextEditors(file: FixupFile): void {
        this.applyDecorations(file, this.tasksWithDecorations.get(file)?.values() || [].values())
    }

    public didCreateTask(task: FixupTask): void {
        const taskOutput = computeOngoingDecorations(task)
        this.updateTaskDecorations(task, taskOutput)
    }

    public didUpdateInProgressTask(task: FixupTask): void {
        const previouslyComputed = this.tasksWithDecorations.get(task.fixupFile)?.get(task)
        const taskOutput = computeOngoingDecorations(task, previouslyComputed)
        this.updateTaskDecorations(task, taskOutput)
    }

    public didApplyTask(task: FixupTask): void {
        const taskOutput = computeAppliedDecorations(task)
        this.updateTaskDecorations(task, taskOutput)
    }

    public didCompleteTask(task: FixupTask): void {
        this.updateTaskDecorations(task, undefined)
    }

    private updateTaskDecorations(task: FixupTask, decorations?: Decorations): void {
        const isEmpty =
            !decorations ||
            (decorations.linesAdded.length === 0 &&
                decorations.linesRemoved.length === 0 &&
                decorations.unvisitedLines.length === 0 &&
                !decorations.currentLine)

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

        fileDecorations.set(task, decorations)
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
            editor => editor.document.uri.toString() === file.uri.toString()
        )
        for (const editor of editors) {
            editor.setDecorations(CURRENT_LINE_DECORATION, currentLineDecorations)
            editor.setDecorations(UNVISITED_LINE_DECORATION, unvisitedLinesDecorations)
            editor.setDecorations(INSERTED_CODE_DECORATION, addedDecorations)
            editor.setDecorations(REMOVED_CODE_DECORATION, removedDecorations)
        }
    }
}
