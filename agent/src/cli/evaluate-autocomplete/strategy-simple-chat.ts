import { promises as fsPromises } from 'fs'
import * as path from 'path'
import { ContextFile } from '@sourcegraph/cody-shared'
import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'
import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig } from './evaluate-autocomplete'

interface ChatReply {
    question: string
    ground_truth_answer: string
    reply: string | undefined
    contextFiles: ContextFile[] | undefined
    fixture: string
}

let embeddingDoneFlag = false

function registerChatSimulationHandlers(client: MessageHandler, repoDisplayName: string): void {
    client.registerNotification('webview/postMessage', (param) => {
        const messageType = param.message.type
        switch(messageType) {
            case "enhanced-context":
                console.log("params are:", JSON.stringify(param))

                const repo_context_data = param.message.context.groups.filter(group => group.displayName === repoDisplayName)
                if (repo_context_data.length <= 0)
                    break

                const embedding_state = repo_context_data[0].providers.filter(provider => provider.kind === "embeddings")

                if(embedding_state.length > 0 && embedding_state[0].state === "ready") {
                    embeddingDoneFlag = true
                    console.log('resetting embedding flag true for repo:', repoDisplayName)
                    console.log('final embeddingDoneFlag:', JSON.stringify(embeddingDoneFlag))
                }
                break;
            default:
                break;
        }
    })
}

const waitForVariable = (): Promise<void> => {
    console.log('waiting on the variable now ....')
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (embeddingDoneFlag) {
                console.log("embeddings should be ready now: resolving")
                clearInterval(interval);
                resolve();
            }
        }, 1000);
    });
}

export async function evaluateSimpleChatStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    const { workspace } = options
    const repoDisplayName = workspace.split("/").at(-1);
    if(repoDisplayName===undefined)
        return;

    embeddingDoneFlag = false

    registerChatSimulationHandlers(client, repoDisplayName)

    console.log('before starting the chat simulation: variable are:', embeddingDoneFlag);

    if(options.fixture?.webViewConfiguration?.useEnhancedContext){

        if (options.fixture?.customConfiguration?.["cody.useContext"] == "embeddings") {
            console.log('detected embedding types for the repo')
            const id = await client.request('chat/new', null)
            console.log('starting the indexing')
            await client.request('webview/receiveMessage', { id, message: { command: 'embeddings/index' } })
            await client.request('webview/didDispose', {id})

            console.log('waiting for embedding completion for repo:', repoDisplayName)
            await waitForVariable()
            console.log('embedding creation completed for repo:', repoDisplayName)
        }
    }
    const all_chat_configs = options.chat_config ?? []
    const replies = []

    for (const single_chat_config of all_chat_configs) {
        const reply = await simulateChatInRepo(client, options, single_chat_config)
        replies.push(reply)
    }
    await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))
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
                addEnhancedContext: true,
            },
        })
    )
    console.log("llm response is:", JSON.stringify(reply))

    await client.request('webview/didDispose', {id})
    return {
        question: chatEvalConfig.question,
        ground_truth_answer: chatEvalConfig.ground_truth_answer,
        reply: reply.messages.at(-1)?.text,
        contextFiles: reply.messages.at(0)?.contextFiles,
        fixture: JSON.stringify(options.fixture),
    }
}

function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}

async function saveListToFile(list: any[], filePath: string): Promise<void> {
    const data = JSON.stringify(list)
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromises.writeFile(filePath, data)
}



// =======================================================================================================================
// =======================================================================================================================
// ============================================= ASYNC CODE - TRY TO MAKE IT WORK ========================================
// =======================================================================================================================
// =======================================================================================================================

// import { promises as fsPromises } from 'fs'
// import * as path from 'path'
// import { ContextFile } from '@sourcegraph/cody-shared'
// import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../../../vscode/src/chat/protocol'
// import { type MessageHandler } from '../../jsonrpc-alias'
// import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig } from './evaluate-autocomplete'

// interface ChatReply {
//     question: string
//     ground_truth_answer: string
//     reply: string | undefined
//     contextFiles: ContextFile[] | undefined
//     fixture: string
// }

// const embeddingDoneFlag: Map<string, boolean> = new Map();
// const searchDoneFlag: Map<string, boolean> = new Map();

// function registerChatSimulationHandlers(client: MessageHandler, repoDisplayName: string): void {
//     client.registerNotification('webview/postMessage', (param) => {
//         const messageType = param.message.type
//         switch(messageType) {
//             case "enhanced-context":
//                 console.log("params are:", JSON.stringify(param))

//                 const repo_context_data = param.message.context.groups.filter(group => group.displayName === repoDisplayName)
//                 if (repo_context_data.length <= 0)
//                     break

//                 const embedding_state = repo_context_data[0].providers.filter(provider => provider.kind === "embeddings")
//                 const search_state = repo_context_data[0].providers.filter(provider => provider.kind === "search")

//                 if(embedding_state.length > 0 && embedding_state[0].state === "ready") {
//                     embeddingDoneFlag.set(repoDisplayName, true)
//                     console.log('resetting embedding flag true for repo:', repoDisplayName)
//                     console.log('final embeddingDoneFlag:', JSON.stringify(embeddingDoneFlag))
//                 }
//                 if(search_state.length > 0 && search_state[0].state === "ready") {
//                     searchDoneFlag.set(repoDisplayName, true)
//                     console.log('resetting embedding flag true for repo:', repoDisplayName)
//                     console.log('final embeddingDoneFlag:', JSON.stringify(embeddingDoneFlag))
//                 }
//                 break;
//             default:
//                 break;
//         }
//     })
// }

// const waitForVariable = (variable: boolean): Promise<void> => {
//     console.log('waiting on the variable now ....')
//     return new Promise((resolve) => {
//         const interval = setInterval(() => {
//             if (variable) {
//                 console.log("embeddings should be ready now: resolving")
//                 clearInterval(interval);
//                 resolve();
//             }
//         }, 1000);
//     });
// }

// export async function evaluateSimpleChatStrategy(
//     client: MessageHandler,
//     options: EvaluateAutocompleteOptions
// ): Promise<void> {
//     const { workspace } = options
//     const repoDisplayName = workspace.split("/").at(-1);
//     if(repoDisplayName===undefined)
//         return;

//     embeddingDoneFlag.set(repoDisplayName, false)
//     searchDoneFlag.set(repoDisplayName, false)

//     registerChatSimulationHandlers(client, repoDisplayName)

//     console.log('before starting the chat simulation: variable are:', embeddingDoneFlag, ' and search ', searchDoneFlag);

//     if(options.fixture?.webViewConfiguration?.useEnhancedContext){

//         if (options.fixture?.customConfiguration?.["cody.useContext"] == "embeddings") {
//             console.log('detected embedding types for the repo')
//             const id = await client.request('chat/new', null)
//             console.log('starting the indexing')
//             await client.request('webview/receiveMessage', { id, message: { command: 'embeddings/index' } })
//             await client.request('webview/didDispose', {id})

//             console.log('waiting for embedding completion for repo:', repoDisplayName)
//             await waitForVariable(embeddingDoneFlag.get(repoDisplayName) ?? false)
//             console.log('embedding creation completed for repo:', repoDisplayName)
//         } else if (options.fixture?.customConfiguration?.["cody.useContext"] == "search") {
//             const id = await client.request('chat/new', null)
//             await client.request('command/execute', { command: 'cody.search.index-update' })
//             await client.request('webview/didDispose', {id})
//             await waitForVariable(searchDoneFlag.get(repoDisplayName) ?? false)
//         }
//     }
//     const all_chat_configs = options.chat_config ?? []
//     const replies = []

//     for (const single_chat_config of all_chat_configs) {
//         const reply = await simulateChatInRepo(client, options, single_chat_config)
//         replies.push(reply)
//     }
//     await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))
// }

// async function simulateChatInRepo(
//     client: MessageHandler,
//     options: EvaluateAutocompleteOptions,
//     chatEvalConfig: SimpleChatEvalConfig
// ): Promise<ChatReply> {
//     const id = await client.request('chat/new', null)
//     const reply = asTranscriptMessage(
//         await client.request('chat/submitMessage', {
//             id,
//             message: {
//                 command: 'submit',
//                 text: chatEvalConfig.question,
//                 submitType: 'user',
//                 addEnhancedContext: true,
//             },
//         })
//     )
//     console.log("llm response is:", JSON.stringify(reply))

//     await client.request('webview/didDispose', {id})
//     return {
//         question: chatEvalConfig.question,
//         ground_truth_answer: chatEvalConfig.ground_truth_answer,
//         reply: reply.messages.at(-1)?.text,
//         contextFiles: reply.messages.at(0)?.contextFiles,
//         fixture: JSON.stringify(options.fixture),
//     }
// }

// function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
//     if (reply.type === 'transcript') {
//         return reply
//     }
//     throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
// }

// async function saveListToFile(list: any[], filePath: string): Promise<void> {
//     const data = JSON.stringify(list)
//     await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
//     await fsPromises.writeFile(filePath, data)
// }


