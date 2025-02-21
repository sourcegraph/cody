import type {
    VisualAddedLineInfo,
    VisualDiff,
    VisualDiffLine,
    VisualModifiedLineInfoAdded,
    VisualModifiedLineInfoRemoved,
    VisualRemovedLineInfo,
} from '../decorated-diff/types'

type VisualDiffLineOutgoing = Exclude<VisualDiffLine, VisualAddedLineInfo | VisualModifiedLineInfoAdded>
type VisualDiffLineIncoming = Exclude<
    VisualDiffLine,
    VisualRemovedLineInfo | VisualModifiedLineInfoRemoved
>

export function getLines(diff: VisualDiff, type: 'original'): VisualDiffLineOutgoing[]
export function getLines(diff: VisualDiff, type: 'incoming'): VisualDiffLineIncoming[]
export function getLines(diff: VisualDiff, type: 'original' | 'incoming'): VisualDiffLine[] {
    if (type === 'original') {
        // Only return lines that are removed, modified or unchanged.
        return diff.lines.filter((line): line is VisualDiffLineOutgoing =>
            ['removed', 'modified-removed', 'unchanged'].includes(line.type)
        )
    }

    // Only return lines that are added, modified or unchanged.
    return diff.lines.filter((line): line is VisualDiffLineIncoming =>
        ['added', 'modified-added', 'unchanged'].includes(line.type)
    )
}

export function getCodeBlock(
    diff: VisualDiff,
    type: 'original' | 'incoming'
): { code: string; startLine: number } | null {
    if (type === 'original') {
        const relevantLines = getLines(diff, 'original')
        if (relevantLines.length === 0) {
            return null
        }
        const code = relevantLines.map(line => line.text).join('\n')
        return { code, startLine: relevantLines[0].originalLineNumber }
    }

    const relevantLines = getLines(diff, 'incoming')
    if (relevantLines.length === 0) {
        return null
    }
    const code = relevantLines.map(line => line.text).join('\n')
    return { code, startLine: relevantLines[0].modifiedLineNumber }
}
