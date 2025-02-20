import type { VisualDiffLine } from '../decorated-diff/types'

export function getRangesToHighlight(line: VisualDiffLine): [number, number][] {
    switch (line.type) {
        case 'removed':
            // Line removed, highlight the entire line
            return [[0, line.text.length]]
        case 'added':
            // Line added, highlight the entire line
            return [[0, line.text.length]]
        case 'modified-removed':
            // Parts of a line removed, highlight the removed parts
            return line.changes
                .filter(change => change.type === 'delete')
                .map(({ originalRange }) => [originalRange.start.character, originalRange.end.character])
        case 'modified-added':
            // Parts of a line added, highlight the added parts
            return line.changes
                .filter(change => change.type === 'insert')
                .map(change => [
                    change.modifiedRange.start.character,
                    change.modifiedRange.end.character,
                ])
        default:
            return []
    }
}
