import type { Message } from '@anthropic-ai/sdk/resources'

export function mustExtractXML(text: string, tag: string): string {
    const r = extractXML(text, tag)
    if (r === null) {
        throw new Error(`did not find xml tag ${tag} in text ${text}`)
    }
    return r
}

function extractXML(text: string, tag: string): string | null {
    const startTag = `<${tag}>`
    const endTag = `</${tag}>`
    const startIndex = text.indexOf(startTag)
    const endIndex = text.indexOf(endTag)
    if (startIndex === -1 || endIndex === -1) {
        return null
    }
    return text.slice(startIndex + startTag.length, endIndex).trim()
}

function anthropicMessageToText(message: Message): string {
    if (message.content.length === 0 || message.content.length > 1) {
        throw new Error(
            `expected exactly one text block in claude response, got ${message.content.length})`
        )
    }
    return message.content[0].text
}

export function extractXMLFromAnthropicResponse(message: Message, tag: string): string {
    const text = anthropicMessageToText(message)
    const extracted = extractXML(text, tag)
    if (extracted === null) {
        throw new Error(`could not find tag ${tag} in claude response:\n${text}`)
    }
    return extracted
}

export function extractXMLArray(text: string, tag: string): string[] {
    const startTag = `<${tag}>`
    const endTag = `</${tag}>`
    let start = 0
    const extracted = []
    while (start < text.length) {
        const startIndex = text.indexOf(startTag, start)
        const endIndex = text.indexOf(endTag, startIndex + 1)
        if (startIndex === -1 || endIndex === -1) {
            break
        }
        extracted.push(text.slice(startIndex + startTag.length, endIndex).trim())
        start = endIndex + endTag.length
    }
    return extracted
}
