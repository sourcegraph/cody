import { type DecorationLineInformation, DecorationLineType } from './base'

/**
 * Checks if the only changes for modified lines are additions of text
 */
export function isOnlyAddingTextForModifiedLines(
    decorationInformation: DecorationLineInformation[]
): boolean {
    for (const line of decorationInformation) {
        if (line.lineType !== DecorationLineType.Modified) {
            continue
        }
        if (line.modifiedRanges.some(range => range.from1 !== range.to1)) {
            return false
        }
    }
    return true
}

export function splitLineDecorationIntoLineTypes(decorationInformation: DecorationLineInformation[]): {
    modifiedLines: DecorationLineInformation[]
    removedLines: DecorationLineInformation[]
    addedLines: DecorationLineInformation[]
    unchangedLines: DecorationLineInformation[]
} {
    const result = {
        modifiedLines: [] as DecorationLineInformation[],
        removedLines: [] as DecorationLineInformation[],
        addedLines: [] as DecorationLineInformation[],
        unchangedLines: [] as DecorationLineInformation[],
    }

    for (const line of decorationInformation) {
        switch (line.lineType) {
            case DecorationLineType.Modified:
                result.modifiedLines.push(line)
                break
            case DecorationLineType.Removed:
                result.removedLines.push(line)
                break
            case DecorationLineType.Added:
                result.addedLines.push(line)
                break
            case DecorationLineType.Unchanged:
                result.unchangedLines.push(line)
                break
        }
    }

    return result
}
