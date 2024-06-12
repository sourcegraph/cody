export function getLastFullLine(str: string): string {
    const match = str.match(/.*\n(?=.*$)/)

    if (match) {
        return match[0].slice(0, -1)
    }

    return ''
}
