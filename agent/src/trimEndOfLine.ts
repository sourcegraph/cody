export function trimEndOfLine(text: string | undefined): string {
    if (text === undefined) {
        return ''
    }
    return text
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
}
