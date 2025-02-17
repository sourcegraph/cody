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

function getLines(diff: VisualDiff, type: 'outgoing'): VisualDiffLineOutgoing[]
function getLines(diff: VisualDiff, type: 'incoming'): VisualDiffLineIncoming[]
function getLines(diff: VisualDiff, type: 'outgoing' | 'incoming'): VisualDiffLine[] {
    if (type === 'outgoing') {
        // Only return lines that are removed, modified or unchanged.
        return diff.lines.filter(
            (line): line is Exclude<VisualDiffLine, VisualAddedLineInfo | VisualModifiedLineInfoAdded> =>
                ['removed', 'modified', 'modified-removed', 'unchanged'].includes(line.type)
        )
    }

    // Only return lines that are added, modified or unchanged.
    return diff.lines.filter(
        (line): line is Exclude<VisualDiffLine, VisualRemovedLineInfo | VisualModifiedLineInfoRemoved> =>
            ['added', 'modified', 'modified-added', 'unchanged'].includes(line.type)
    )
}

export function getCodeBlock(
    diff: VisualDiff,
    type: 'incoming' | 'outgoing'
): { code: string; startLine: number } {
    if (type === 'outgoing') {
        const relevantLines = getLines(diff, 'outgoing')
        const code = relevantLines.map(line => ('oldText' in line ? line.oldText : line.text)).join('\n')
        return { code, startLine: relevantLines[0].originalLineNumber }
    }

    const relevantLines = getLines(diff, 'incoming')
    const code = relevantLines.map(line => ('newText' in line ? line.newText : line.text)).join('\n')
    return { code, startLine: relevantLines[0].modifiedLineNumber }
}
