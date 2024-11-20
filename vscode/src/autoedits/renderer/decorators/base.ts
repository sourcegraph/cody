import type * as vscode from 'vscode'
import type { ModifiedRange } from '../diff-utils'
import { DefaultDecorator } from './default-decorator'

export enum DecorationStrategyIdentifier {
    DefaultDecorator = 'default-decorator',
}

export function createAutoeditsDecorator(
    identifier: DecorationStrategyIdentifier,
    editor: vscode.TextEditor
): AutoeditsDecorator {
    switch (identifier) {
        case DecorationStrategyIdentifier.DefaultDecorator:
            return new DefaultDecorator(editor)
    }
}

export interface AutoeditsDecorator extends vscode.Disposable {
    setDecorations(decorationInformation: DecorationInformation): void
    clearDecorations(): void
}

/**
 * Represents the different types of line decorations that can be applied.
 */
export enum DecorationLineType {
    /** Line has been modified from its original state */
    Modified = 0,
    /** New line has been added */
    Added = 1,
    /** Line has been removed */
    Removed = 2,
    /** Line remains unchanged */
    Unchanged = 3,
}

export interface DecorationLineInformation {
    lineType: DecorationLineType
    // Line number in the original text. The line number can be null if the line was added.
    oldLineNumber: number | null
    // Line number in the new predicted text. The line number can be null if the line was removed.
    newLineNumber: number | null
    // The text of the line in the original text.
    oldText: string
    // The text of the line in the new predicted text.
    newText: string
    // The ranges of text that were modified in the line.
    modifiedRanges: ModifiedRange[]
}

export interface DecorationInformation {
    lines: DecorationLineInformation[]
    oldLines: string[]
    newLines: string[]
}
