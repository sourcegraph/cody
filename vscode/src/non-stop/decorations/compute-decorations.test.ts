import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { document } from '../../completions/test-helpers'
import type { FixupTask } from '../FixupTask'
import { computeOngoingDecorations } from './compute-decorations'

describe('computeOngoingDecorations', () => {
    it('marks the first line as active, and future lines as unvisited when no full lines yet', () => {
        const doc = document('Hello\nWorld')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hello',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask

        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(decorations?.unvisitedLines).toStrictEqual([{ range: new vscode.Range(1, 0, 1, 0) }])
    })

    it('marks the first line as active when full line receivedt', () => {
        const doc = document('Hello\nWorld')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hello\n',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask

        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(decorations?.unvisitedLines).toStrictEqual([{ range: new vscode.Range(1, 0, 1, 0) }])
    })

    it('marks the first line as active when unknown line received', () => {
        const doc = document('Hello\nWorld')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hey\n',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask

        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(decorations?.unvisitedLines).toStrictEqual([{ range: new vscode.Range(1, 0, 1, 0) }])
    })

    it('marks the second line as active when second line received, and updates unvisited lines', () => {
        const doc = document('Hello\nWorld')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hello\nWorld\n',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask

        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({ range: new vscode.Range(1, 0, 1, 0) })
        expect(decorations?.unvisitedLines).toStrictEqual([])
    })

    it('marks the second line as active when second line received, and updates unvisited lines', () => {
        // Partial first line replacement
        const doc = document('Hello\nWorld')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hel',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask
        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({
            range: new vscode.Range(0, 0, 0, 0),
        })
        expect(decorations?.unvisitedLines).toStrictEqual([{ range: new vscode.Range(1, 0, 1, 0) }])

        // Full first line replacement, partial second line
        mockTask.inProgressReplacement = 'Hello\nWor'
        const decorations2 = computeOngoingDecorations(mockTask, decorations)
        expect(decorations2?.currentLine).toStrictEqual({ range: new vscode.Range(0, 0, 0, 0) })
        expect(decorations2?.unvisitedLines).toStrictEqual([{ range: new vscode.Range(1, 0, 1, 0) }])

        // Full second line replacement
        mockTask.inProgressReplacement = 'Hello\nWorld\n'
        const decorations3 = computeOngoingDecorations(mockTask, decorations2)
        expect(decorations3?.currentLine).toStrictEqual({ range: new vscode.Range(1, 0, 1, 0) })
        expect(decorations3?.unvisitedLines).toStrictEqual([])
    })

    it('trims empty lines from the selection', () => {
        const doc = document('\nHello\nWorld\n')
        const mockTask = {
            original: doc.getText(),
            inProgressReplacement: 'Hello\nWorld\n',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: doc,
        } as FixupTask

        const decorations = computeOngoingDecorations(mockTask)
        expect(decorations?.currentLine).toStrictEqual({ range: new vscode.Range(2, 0, 2, 0) })
        expect(decorations?.unvisitedLines).toStrictEqual([])
    })
})
