import { ContextMessage } from '../codebase-context/messages'

import { CHARS_PER_TOKEN } from './constants'

/**
 * Truncates text to the given number of tokens, keeping the start of the text.
 */
export function truncateText(text: string, maxTokens: number): string {
    const maxLength = maxTokens * CHARS_PER_TOKEN
    return text.length <= maxLength ? text : text.slice(0, maxLength)
}

/**
 * Truncates text to the given number of tokens, keeping the end of the text.
 */
export function truncateTextStart(text: string, maxTokens: number): string {
    const maxLength = maxTokens * CHARS_PER_TOKEN
    return text.length <= maxLength ? text : text.slice(-maxLength - 1)
}

export function getLinuxCommandContextMessages(): ContextMessage[] {
    return [
        { speaker: 'human', text: 'Human: What are all the files in my directory?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To list all files in your current directory, you can use the following command: `ls`.',
        },
        { speaker: 'human', text: 'Human: How do I check my current directory?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To check your current directory, you can use the following command: `pwd`.',
        },
        { speaker: 'human', text: 'Human: How do I create a new directory?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To create a new directory, you can use the following command: `mkdir <directory_name>`.',
        },
        { speaker: 'human', text: 'Human: List all the files where $SYMBOL being used?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To find where `$SYMBOL` is being used in your current directory and its subdirectories, you can use the following command: `grep -r "$SYMBOL" .`.',
        },
        { speaker: 'human', text: 'Human: How do I move a file?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To move a file, you can use the following command: `mv <source> <destination>`.',
        },
        { speaker: 'human', text: 'Human: How do I see disk usage?' },
        {
            speaker: 'assistant',
            text: 'Assistant: To check disk usage, you can use the following command: `df -h`.',
        },
    ]
}
