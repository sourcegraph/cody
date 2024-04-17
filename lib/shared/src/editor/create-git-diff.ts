import { createTwoFilesPatch } from 'diff'

export function createGitDiff(filename: string, oldContent: string, newContent: string) {
    const patch = createTwoFilesPatch(`a/${filename}`, `b/${filename}`, oldContent, newContent)
    return patch.split('\n').slice(1).join('\n')
}
