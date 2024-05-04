import type { Message } from '@anthropic-ai/sdk/resources'

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

export function extractXMLFromAnthropicResponse(message: Message, tag: string): string {
    if (message.content.length === 0 || message.content.length > 1) {
        throw new Error(
            `expected exactly one text block in claude response, got ${message.content.length})`
        )
    }
    const extracted = extractXML(message.content[0].text, tag)
    if (extracted === null) {
        throw new Error(`could not find tag ${tag} in claude response:\n${message.content[0].text}`)
    }
    return extracted
}
