import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'
import type { ContextItem } from '../../codebase-context/messages'
import { type RangeData, toRangeData } from '../../common/range'
import { displayPath } from '../../editor/displayPath'
import { reformatBotMessageForChat } from '../viewHelpers'
import type { ChatMessage } from './messages'

/**
 * Process the message's text to produce the text that should be displayed to the user. This lets us
 * fix any unclosed Markdown code blocks, remove any erroneous `Human:` suffixes, and do any other
 * cleanup that we determine to be necessary from LLM outputs.
 */
export function getDisplayText(message: ChatMessage): string {
    if (!message.text) {
        return ''
    }
    if (message.speaker === 'human') {
        return createDisplayTextWithFileLinks(message.text, message.contextFiles ?? [])
    }
    if (message.speaker === 'assistant') {
        return reformatBotMessageForChat(message.text)
    }
    throw new Error(`unable to get display text for message with speaker '${message.speaker}'`)
}

/**
 * VS Code intentionally limits what `command:vscode.open?ARGS` can have for args (see
 * https://github.com/microsoft/vscode/issues/178868#issuecomment-1494826381); you can't pass a
 * selection or viewColumn. We need to proxy `vscode.open` to be able to pass these args.
 *
 * Also update `lib/shared/src/chat/markdown.ts`'s `ALLOWED_URI_REGEXP` if you change this.
 */
export const CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID = '_cody.vscode.open'

/**
 * Creates display text for the given context files by replacing file names with markdown links.
 */
function createDisplayTextWithFileLinks(humanInput: string, files: ContextItem[]): string {
    let formattedText = humanInput
    for (const file of files) {
        // +1 on the end line numbers because we want to make sure to include everything on the end line by
        // including the next line at position 0.
        const range = file.range ? toRangeData(file.range) : undefined
        try {
            formattedText = replaceFileNameWithMarkdownLink(
                formattedText,
                file.uri,
                range
                    ? {
                          start: { line: range.start.line, character: 0 },
                          end: { line: range.end.line + 1, character: 0 },
                      }
                    : undefined,
                file.type === 'symbol' ? file.symbolName : undefined
            )
        } catch (error) {
            console.error('createDisplayTextWithFileLinks error:', error)
            // Just use text without links as a fallback. This can happen on chat history that was
            // serialized using an old and unrecognized format, which is a subtle bug.
        }
    }
    return formattedText
}

/**
 * Replaces a file name in given text with markdown link to open that file in editor.
 * @returns The updated text with the file name replaced by a markdown link.
 */
export function replaceFileNameWithMarkdownLink(
    humanInput: string,
    file: URI,
    range?: RangeData,
    symbolName?: string
): string {
    const inputRepr = inputRepresentation(humanInput, file, range, symbolName)
    if (!inputRepr) {
        return humanInput
    }
    // Use regex to makes sure the file name is surrounded by spaces and not a substring of another file name
    const fileAsInput = inputRepr.replaceAll(/[$()*+./?[\\\]^{|}-]/g, '\\$&')
    const textToBeReplaced = new RegExp(`\\s*@${fileAsInput}(?![\S#-_])`, 'g')
    const markdownText = `[_@${inputRepr}_](command:${CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}?${encodeURIComponent(
        JSON.stringify([
            file,
            {
                selection: range,
                preserveFocus: true,
                background: false,
                preview: true,
                viewColumn: -2 satisfies vscode.ViewColumn.Beside,
            },
        ])
    )})`

    const text = humanInput
        .replace(trailingNonAlphaNumericRegex, '')
        .replace(textToBeReplaced, ` ${markdownText}`)
    const trailingNonAlphanum = humanInput.match(trailingNonAlphaNumericRegex)?.[0] ?? ''
    return (text + trailingNonAlphanum).trim()
}

const trailingNonAlphaNumericRegex = /[^\d#@A-Za-z]+$/

/**
 * Generates a string representation of the given file, range, and symbol name
 * to use when linking to locations in code.
 */
function inputRepresentation(
    humanInput: string,
    file: URI,
    range?: RangeData,
    symbolName?: string
): string {
    const fileName = displayPath(file)
    const components = [fileName]
    const startLine = range?.start?.line
    // +1 on start line because VS Code line numbers start at 1 in the editor UI,
    // and is zero-based in the API for position used in VS Code selection/range.
    // Since createDisplayTextWithFileLinks added 1 to end line, we don't need to add it again here.
    // But add it for start line because this is for displaying the line number to user, which is +1-based.
    if (startLine !== undefined) {
        const fullRange = range?.end?.line && `:${startLine + 1}-${range.end.line}`
        if (fullRange && humanInput.includes(`@${fileName}${fullRange}`)) {
            components.push(fullRange)
        } else if (humanInput.matchAll(new RegExp(`@${fileName}:${startLine}(?!-)`, 'g'))) {
            if (startLine + 1 === range?.end?.line) {
                components.push(`:${startLine + 1}`)
            }
        }
        components.push(symbolName ? `#${symbolName}` : '')
    }

    return components.join('').trim()
}
