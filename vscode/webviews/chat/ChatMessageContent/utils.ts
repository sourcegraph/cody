import { SHA256 } from 'crypto-js'

export function getFileName(filePath: string): string {
    return filePath.split('/').pop() || filePath
}

export function getCodeBlockId(contents: string, fileName?: string): string {
    let input = contents.trim()
    if (fileName) {
        input = `${fileName}:${input}`
    }
    return SHA256(input).toString()
}

interface StreamingContent {
    displayContent: string
    thinkContent: string
    isThinking: boolean
}

/**
 * Extracts content enclosed in `<think>` tags from the beginning of a string.
 * This function processes text that may contain special thinking content markers.
 *
 * @param content - The input string that may contain thinking content
 * @returns A StreamingContent object with three properties:
 *   - displayContent: The portion of the input string that should be displayed to the user
 *                    (excludes content in think tags at the start)
 *   - thinkContent: The content found inside the think tags, if any
 *   - isThinking: A boolean indicating whether we're in "thinking" mode:
 *                 true when there's either an unclosed think tag or
 *                 a complete think tag with no content after it
 *
 * Note: Only think tags at the start of the content are processed.
 * Think tags appearing later in the content are left as-is in displayContent.
 */
const lengthOfThinkTag = '<think>'.length
export function extractThinkContent(content: string): StreamingContent {
    // Match think tags at the start of the content
    const thinkRegex = /^<think>([\s\S]*?)<\/think>/
    const match = content.match(thinkRegex)

    // Check if content starts with a think tag
    const startsWithThink = content.startsWith('<think>')

    let thinkContent = ''
    let displayContent = content
    let isThinking = false

    if (match) {
        // We found a complete think tag at the start
        thinkContent = match[1].trim()
        displayContent = content.slice(match[0].length)

        // If there's no content after the think tag, we're still in thinking mode
        isThinking = displayContent.trim() === ''
    } else if (startsWithThink) {
        // We have an unclosed think tag at the start
        thinkContent = content.slice(lengthOfThinkTag) // length of '<think>'
        displayContent = ''
        isThinking = true
    }

    return {
        displayContent,
        thinkContent,
        isThinking,
    }
}
