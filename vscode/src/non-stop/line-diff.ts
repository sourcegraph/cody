import { type Change, diffLines } from 'diff'

export function computeLineDiff(original: string, replacement: string): Change[] {
    const replacementLines = replacement.split('\n').length
    const comparableOriginal = original.split('\n').slice(0, replacementLines).join('\n')
    const test = diffLines(comparableOriginal, replacement, { ignoreWhitespace: true })
    return test
}
