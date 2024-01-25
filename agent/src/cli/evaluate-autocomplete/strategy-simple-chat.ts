import { promises as fsPromises } from 'fs'
import * as path from 'path'
import type { ExtensionMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'
import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig, EvaluationFixture } from './evaluate-autocomplete'


interface ChatReply {
    question: string
    ground_truth_answer: string
    reply: ExtensionMessage
    fixture: EvaluationFixture
}

interface EmbeddingFlag {
    value: boolean
}

export async function evaluateSimpleChatStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    if(options.shouldUpdateEmbedding==='true') {
        await createEmbeddings(client, options)
    } else {
        await simulateWorkspaceChat(client, options)
    }
}

// ================== Handle embeddings creation =====================

function registerEmbeddingsHandlers(client: MessageHandler, repoDisplayName: string, embeddingDoneFlag: EmbeddingFlag): void {
    client.registerNotification('webview/postMessage', (param) => {
        const messageType = param.message.type
        switch(messageType) {
            case "enhanced-context":
                const repo_context_data = param.message.context.groups.filter(group => group.displayName === repoDisplayName)
                if (repo_context_data.length <= 0)
                    break

                const embedding_state = repo_context_data[0].providers.filter(provider => provider.kind === "embeddings")

                if(embedding_state.length > 0 && embedding_state[0].state === "ready") {
                    embeddingDoneFlag.value = true
                }
                break;
            default:
                break;
        }
    })
}

async function createEmbeddings(client: MessageHandler, options: EvaluateAutocompleteOptions): Promise<void> {
    const { workspace } = options
    const repoDisplayName = workspace.split("/").at(-1);
    if(repoDisplayName===undefined)
        return;

    let embeddingDoneFlag: EmbeddingFlag = {
        value: false
    }
    registerEmbeddingsHandlers(client, repoDisplayName, embeddingDoneFlag)

    if(options.fixture?.webViewConfiguration?.useEnhancedContext){

        if (options.fixture?.customConfiguration?.["cody.useContext"] == "embeddings") {
            const id = await client.request('chat/new', null)
            await client.request('webview/receiveMessage', { id, message: { command: 'embeddings/index' } })
            await client.request('webview/didDispose', {id})
            await waitForVariable(embeddingDoneFlag)
        }
    }
}

const waitForVariable = (variable: EmbeddingFlag): Promise<void> => {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (variable.value) {
                clearInterval(interval);
                resolve();
            }
        }, 1000);
    });
}

// ====================================================================

async function simulateWorkspaceChat(client: MessageHandler, options: EvaluateAutocompleteOptions): Promise<void> {
    client.registerNotification('webview/postMessage', () => {})
    const all_chat_configs = options.chat_config ?? []
    const replies = await Promise.all(all_chat_configs.map(single_chat_config => simulateChatInRepo(client, options, single_chat_config)))
    await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))

}

async function simulateChatInRepo(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions,
    chatEvalConfig: SimpleChatEvalConfig
): Promise<ChatReply> {
    const id = await client.request('chat/new', null)
    const reply = await client.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text: chatEvalConfig.question,
                submitType: 'user',
                addEnhancedContext: true,
            },
        })

    await client.request('webview/didDispose', {id})
    return {
        question: chatEvalConfig.question,
        ground_truth_answer: chatEvalConfig.ground_truth_answer,
        reply: reply,
        fixture: options.fixture,
    }
}

async function saveListToFile(list: any[], filePath: string): Promise<void> {
    const data = JSON.stringify(list)
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, data)
}

// ====================================================================
