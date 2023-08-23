export function debugLog(debug: boolean, title: string, text: string): void {
    if (debug) {
        const sep = '###############################################'
        console.error(sep)
        console.error(`# ${title}`)
        console.error(sep)
        console.error(text)
        console.error(sep)
    }
}
