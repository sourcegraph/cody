import type * as vscode from 'vscode'

export interface Decorations {
    linesAdded?: vscode.DecorationOptions[]
    linesRemoved?: vscode.DecorationOptions[]
    currentLine?: vscode.DecorationOptions
    unvisitedLines?: vscode.DecorationOptions[]
}

export type PlaceholderLines = number[]

export interface ComputedOutput {
    decorations: Decorations
    placeholderLines?: PlaceholderLines
}
