import { createTwoFilesPatch } from 'diff'

export function createGitDiff(
    filename: string,
    oldContent: string,
    newContent: string,
    contextLines = 4
) {
    const patch = createTwoFilesPatch(
        `a/${filename}`,
        `b/${filename}`,
        oldContent,
        newContent,
        undefined,
        undefined,
        { context: contextLines }
    )
    return patch.split('\n').slice(1).join('\n')
}
