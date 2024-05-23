export function trimEndOfLine(text: string | undefined): string {
    if (text === undefined) {
        return ''
    }
    return text
        .trim()
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}
