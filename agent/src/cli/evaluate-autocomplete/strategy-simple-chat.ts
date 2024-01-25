import { promises as fsPromises } from 'fs'
import * as path from 'path'
import type { ExtensionMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'
import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig, EvaluationFixture } from './evaluate-autocomplete'
import { exit } from 'process'
import { Semaphore } from 'async-mutex';


interface ChatReply {
    repo_path: string
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
            console.log('--------- --------- --------- --------- --------- --------- ---------')
            console.log(`embedding creation completed for repo: ${repoDisplayName}`)
            console.log('--------- --------- --------- --------- --------- --------- ---------')
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

    const concurrencyLimit = 5
    const semaphore = new Semaphore(concurrencyLimit);
    const replies = await Promise.all(all_chat_configs.map(async (single_chat_config) => {
        const [_, release] = await semaphore.acquire();
        try {
            const reply = await simulateChatInRepo(client, options, single_chat_config);
            return reply
        } finally {
            release();
        }
    }));

    // const replies = await Promise.all(all_chat_configs.map(single_chat_config => simulateChatInRepo(client, options, single_chat_config)))
    
    if(replies.length<=0) {
        console.log('--------- --------- --------- --------- --------- --------- ---------')
        console.log(`length of replies is 0 ${replies}`)
        exit(1)
    }

    await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))
    console.log('--------- --------- --------- --------- --------- --------- ---------')
    console.log(`Saved results for workspace ${options.workspace}`)
    console.log('--------- --------- --------- --------- --------- --------- ---------')
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
    
    checkInvalidReplyAndExit(reply)

    await client.request('webview/didDispose', {id})
    return {
        repo_path: options.workspace,
        question: chatEvalConfig.question,
        ground_truth_answer: chatEvalConfig.ground_truth_answer,
        reply: reply,
        fixture: options.fixture,
    }
}

function checkInvalidReplyAndExit(reply: ExtensionMessage): void {
    if (reply.type === 'transcript') {
        const llm_reply_message = reply.messages.at(-1)
        if (llm_reply_message == undefined || llm_reply_message.error)  {
            console.log('--------- --------- --------- --------- --------- --------- ---------')
            console.log(`Error: expected transcript, got unexpected reply: ${JSON.stringify(reply)}`)
            exit(1)
        }
        return
    }
    console.log('--------- --------- --------- --------- --------- --------- ---------')
    console.log(`Error: expected transcript, got unexpected reply: ${JSON.stringify(reply)}`)
    exit(1)
}

async function saveListToFile(list: any[], filePath: string): Promise<void> {
    const data = JSON.stringify(list)
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, data)
}

// ====================================================================
