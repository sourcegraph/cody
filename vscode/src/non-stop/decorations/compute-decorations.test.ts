import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import type { FixupTask } from '../FixupTask'
import { computeOngoingDecorations } from './compute-decorations'

describe('computeOngoingDecorations', () => {
    it('marks the first line as active, and future lines as unvisited when no full lines yet', () => {
        const mockTask = {
            original: 'Hello\nWorld',
            inProgressReplacement: 'Hello',
            selectionRange: new vscode.Range(0, 0, 1, 0),
        } as FixupTask

        const computed = computeOngoingDecorations(mockTask)
        expect(computed?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(computed?.decorations.unvisitedLines).toStrictEqual([
            { range: new vscode.Range(1, 0, 1, 0) },
        ])
    })

    it('marks the first line as active when full line receivedt', () => {
        const mockTask = {
            original: 'Hello\nWorld',
            inProgressReplacement: 'Hello\n',
            selectionRange: new vscode.Range(0, 0, 1, 0),
        } as FixupTask

        const computed = computeOngoingDecorations(mockTask)
        expect(computed?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(computed?.decorations.unvisitedLines).toStrictEqual([
            { range: new vscode.Range(1, 0, 1, 0) },
        ])
    })

    it('marks the first line as active when unknown line received', () => {
        const mockTask = {
            original: 'Hello\nWorld',
            inProgressReplacement: 'Hey\n',
            selectionRange: new vscode.Range(0, 0, 1, 0),
        } as FixupTask

        const computed = computeOngoingDecorations(mockTask)
        expect(computed?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(computed?.decorations.unvisitedLines).toStrictEqual([
            { range: new vscode.Range(1, 0, 1, 0) },
        ])
    })

    it('marks the second line as active when second line received, and updates unvisited lines', () => {
        const mockTask = {
            original: 'Hello\nWorld',
            inProgressReplacement: 'Hello\nWorld\n',
            selectionRange: new vscode.Range(0, 0, 1, 0),
        } as FixupTask

        const computed = computeOngoingDecorations(mockTask)
        expect(computed?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(1, 0, 1, 0) })
        expect(computed?.decorations.unvisitedLines).toStrictEqual([])
    })

    it('marks the second line as active when second line received, and updates unvisited lines', () => {
        // Partial first line replacement
        const mockTask = {
            original: 'Hello\nWorld',
            inProgressReplacement: 'Hel',
            selectionRange: new vscode.Range(0, 0, 1, 0),
        } as FixupTask
        const computed = computeOngoingDecorations(mockTask)
        expect(computed?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(computed?.decorations.unvisitedLines).toStrictEqual([
            { range: new vscode.Range(1, 0, 1, 0) },
        ])

        // Full first line replacement, partial second line
        mockTask.inProgressReplacement = 'Hello\nWor'
        const computed2 = computeOngoingDecorations(mockTask, computed?.decorations)
        expect(computed2?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(computed2?.decorations.unvisitedLines).toStrictEqual([
            { range: new vscode.Range(1, 0, 1, 0) },
        ])

        // Full second line replacement
        mockTask.inProgressReplacement = 'Hello\nWorld\n'
        const computed3 = computeOngoingDecorations(mockTask, computed2?.decorations)
        expect(computed3?.decorations.currentLine).toStrictEqual({ range: new vscode.Range(1, 0, 1, 0) })
        expect(computed3?.decorations.unvisitedLines).toStrictEqual([])
    })
})
