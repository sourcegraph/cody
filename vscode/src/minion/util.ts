import type { Message } from '@anthropic-ai/sdk/resources'

export function mustExtractXML(text: string, tag: string): string {
    const r = extractXML(text, tag)
    if (r === null) {
        throw new Error(`did not find xml tag ${tag} in text ${text}`)
    }
    return r
}

interface ExtractXMLOptions {
    trimPrefix: 'newline' | 'whitespace' | 'none'
    trimSuffix: 'newline' | 'whitespace' | 'none'
}

const defaultExtractXMLOptions: ExtractXMLOptions = {
    trimPrefix: 'whitespace',
    trimSuffix: 'whitespace',
}

export function extractXML(text: string, tag: string, ops = defaultExtractXMLOptions): string | null {
    const startTag = `<${tag}>`
    const endTag = `</${tag}>`
    const startIndex = text.indexOf(startTag)
    const endIndex = text.indexOf(endTag)
    if (startIndex === -1 || endIndex === -1) {
        return null
    }
    let extracted = text.slice(startIndex + startTag.length, endIndex)
    switch (ops.trimPrefix) {
        case 'newline':
            if (extracted.startsWith('\n')) {
                extracted = extracted.slice(1)
            }
            break
        case 'whitespace':
            extracted = extracted.trimStart()
            break
    }
    switch (ops.trimSuffix) {
        case 'newline':
            if (extracted.endsWith('\n')) {
                extracted = extracted.slice(0, -1)
            }
            break
        case 'whitespace':
            extracted = extracted.trimEnd()
            break
    }
    return extracted
}

function anthropicMessageToText(message: Message): string {
    if (message.content.length === 0 || message.content.length > 1) {
        throw new Error(
            `expected exactly one text block in claude response, got ${message.content.length})`
        )
    }
    return message.content[0].text
}

export function extractXMLFromAnthropicResponse(
    message: Message,
    tag: string,
    ops = defaultExtractXMLOptions
): string {
    const text = anthropicMessageToText(message)
    const extracted = extractXML(text, tag, ops)
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

export function extractXMLArrayFromAnthropicResponse(message: Message, tag: string): string[] {
    return extractXMLArray(anthropicMessageToText(message), tag)
}
