export function extractXML(text: string, tag: string): string | null {
    const startTag = `<${tag}>`
    const endTag = `</${tag}>`
    const startIndex = text.indexOf(startTag)
    const endIndex = text.indexOf(endTag)
    if (startIndex === -1 || endIndex === -1) {
        return null
    }
    return text.slice(startIndex + startTag.length, endIndex).trim()
}
