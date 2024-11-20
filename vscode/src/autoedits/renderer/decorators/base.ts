import {ModifiedRange} from '../diff-utils';

/**
 * Represents the different types of line decorations that can be applied.
 */
export enum DecorationLineType {
    /** Line has been modified from its original state */
    Modified,
    /** New line has been added */
    Added,
    /** Line has been removed */
    Removed,
    /** Line remains unchanged */
    Unchanged,
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
