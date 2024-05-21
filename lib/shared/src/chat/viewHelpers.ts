import { type PromptString, ps } from '../prompt/prompt-string'

const STOP_SEQUENCE_REGEXP = /(H|Hu|Hum|Huma|Human|Human:)$/

/**
 * If the bot message ends with some prefix of the `Human:` stop sequence, trim if from the end.
 */
export function reformatBotMessageForChat(text: PromptString): PromptString {
    let reformattedMessage = text.trimEnd()

    const stopSequenceMatch = reformattedMessage.toString().match(STOP_SEQUENCE_REGEXP)
    if (stopSequenceMatch) {
        reformattedMessage = reformattedMessage.slice(0, stopSequenceMatch.index)
    }
    // TODO: Detect if bot sent unformatted code without a markdown block.
    return fixOpenMarkdownCodeBlock(reformattedMessage)
}

function fixOpenMarkdownCodeBlock(text: PromptString): PromptString {
    const occurrences = text.split('```').length - 1
    if (occurrences % 2 === 1) {
        return text.concat(ps`\n\`\`\``)
    }
    return text
}
