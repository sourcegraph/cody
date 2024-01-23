import { promises as fsPromises } from 'fs'
import * as path from 'path'

import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'

import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig } from './evaluate-autocomplete'

async function saveListToFile(list: any[], filePath: string): Promise<void> {
    const data = JSON.stringify(list)
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, data)
}

function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}

interface ChatReply {
    question: string
    ground_truth_answer: string
    reply: string | undefined
    fixture: string
}

async function simulateChatInRepo(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions,
    chatEvalConfig: SimpleChatEvalConfig
): Promise<ChatReply> {
    const id = await client.request('chat/new', null)
    const reply = asTranscriptMessage(
        await client.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text: chatEvalConfig.question,
                submitType: 'user',
                addEnhancedContext: false,
            },
        })
    )
    await client.request('webview/didDispose', {id})
    return {
        question: chatEvalConfig.question,
        ground_truth_answer: chatEvalConfig.ground_truth_answer,
        reply: reply.messages.at(-1)?.text,
        fixture: JSON.stringify(options.fixture),
    }
}


export async function evaluateSimpleChatStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    const all_chat_configs = options.chat_config ?? []
    const replies = []

    for (const single_chat_config of all_chat_configs) {
        const reply = await simulateChatInRepo(client, options, single_chat_config)
        replies.push(reply)
    }
    await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))

}
