import { promises as fsPromises } from 'fs'
import * as path from 'path'
import type { ExtensionMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'
import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig, EvaluationFixture } from './evaluate-autocomplete'
import { exit } from 'process'
import { Semaphore } from 'async-mutex';
import { Uri } from 'vscode'
import { type NotificationMethodName } from '../../jsonrpc-alias'
import fspromises from 'fs/promises'
import { AgentTextDocument } from '../../AgentTextDocument'

export async function evaluateSimpleChatStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    await createEmbeddings(client, options)
    await simulateWorkspaceChat(client, options)

    // if(options.shouldUpdateEmbedding==='true') {
    //     await createEmbeddings(client, options)
    // } else {
    //     await simulateWorkspaceChat(client, options)
    // }
}

// ================== Handle embeddings creation =====================

interface EmbeddingFlag {
    isEmbeddingReady: boolean,
    isNumItemNeedIndexZero: boolean,
    isSearchIndexReady: boolean,
}

function registerEmbeddingsHandlers(client: MessageHandler, repoDisplayName: string, embeddingDoneFlag: EmbeddingFlag): void {
    // override existing debug message
    client.registerNotification('debug/message', param => {
        // Add handler for the index length here
        if(param.channel==='Cody by Sourcegraph'){
            const debug_message = param.message
            const index_health_prefix = '█ LocalEmbeddingsController: index-health '
            if (debug_message.startsWith(index_health_prefix)) {
                const jsonString = debug_message.replace(index_health_prefix, '')
                try {
                    const indexHealthObj = JSON.parse(jsonString)
                    if(indexHealthObj.numItemsNeedEmbedding===0){
                        embeddingDoneFlag.isNumItemNeedIndexZero = true
                    }
                } catch (error) {
                    console.log(`Got error while trying to parse the index-health message: ${jsonString}, error is: ${error}`)
                }
            }
        }        
    })

    client.registerNotification('webview/postMessage', (param) => {
        const messageType = param.message.type
        switch(messageType) {
            case "enhanced-context":
                const repo_context_data = param.message.context.groups.filter(group => group.displayName === repoDisplayName)
                if (repo_context_data.length <= 0)
                    break

                const embedding_state = repo_context_data[0].providers.filter(provider => provider.kind === "embeddings")
                const search_state = repo_context_data[0].providers.filter(provider => provider.kind === "search")
                
                if(embedding_state.length > 0 && embedding_state[0].state === "ready") {
                    embeddingDoneFlag.isEmbeddingReady = true
                }
                if(search_state.length > 0 && search_state[0].state === "ready") {
                    embeddingDoneFlag.isSearchIndexReady = true
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
        isEmbeddingReady: false,
        isNumItemNeedIndexZero: false,
        isSearchIndexReady: false,
    }
    registerEmbeddingsHandlers(client, repoDisplayName, embeddingDoneFlag)

    if(options.fixture?.webViewConfiguration?.useEnhancedContext){
        if (options.fixture?.customConfiguration?.["cody.useContext"] == "embeddings") {
            const id = await client.request('chat/new', null)
            await client.request('webview/receiveMessage', { id, message: { command: 'embeddings/index' } })
            await client.request("command/execute", { command: 'cody.embeddings.resolveIssue' })
            await waitForVariable(embeddingDoneFlag)
            await client.request('webview/didDispose', {id})

            console.log('--------- --------- --------- --------- --------- --------- ---------')
            console.log(`embedding creation completed for repo: ${repoDisplayName}`)
            console.log('--------- --------- --------- --------- --------- --------- ---------')
        }
    }
}

const waitForVariable = (variable: EmbeddingFlag): Promise<void> => {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const allValuesTrue = Object.values(variable).every(value => value === true);
            if (allValuesTrue) {
                clearInterval(interval);
                resolve();
            }
        }, 1000);
    });
}

// ====================================================================

interface ChatReply {
    repo_path: string
    question: string
    ground_truth_answer: string
    reply: ExtensionMessage
    fixture: EvaluationFixture
}

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


async function textDocumentEvent(
    client: MessageHandler,
    uri: Uri,
    method: NotificationMethodName,
    params?: { selectionName?: string }
): Promise<void> {
    const selectionName = params?.selectionName ?? 'SELECTION'
    let content = await fspromises.readFile(uri.fsPath, 'utf8')
    const selectionStartMarker = `/* ${selectionName}_START */`
    const selectionStart = content.indexOf(selectionStartMarker)
    const selectionEnd = content.indexOf(`/* ${selectionName}_END */`)
    const cursor = content.indexOf('/* CURSOR */')
    if (selectionStart < 0 && selectionEnd < 0 && params?.selectionName) {
        throw new Error(`No selection found for name ${params.selectionName}`)
    }
    content = content.replace('/* CURSOR */', '')

    const document = AgentTextDocument.from(uri, content)
    const start =
        cursor >= 0
            ? document.positionAt(cursor)
            : selectionStart >= 0
              ? document.positionAt(selectionStart + selectionStartMarker.length)
              : undefined
    const end =
        cursor >= 0 ? start : selectionEnd >= 0 ? document.positionAt(selectionEnd) : undefined
    client.notify(method, {
        uri: uri.toString(),
        content,
        selection: start && end ? { start, end } : undefined,
    })
}

function openFile(client: MessageHandler, uri: Uri, params?: { selectionName?: string }): Promise<void> {
    return textDocumentEvent(client, uri, 'textDocument/didOpen', params)
}

function getUriPathFromRelativePath(
    workspacePath: string,
    filePath: string
): Uri {
    const absFilePath = path.join(workspacePath, filePath)
    return Uri.file(absFilePath)
}

async function simulateChatInRepo(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions,
    chatEvalConfig: SimpleChatEvalConfig
): Promise<ChatReply> {
    // open files mentioned in the open files path
    if(chatEvalConfig.open_files) {
        for (const file of chatEvalConfig.open_files) {
            const uri  = getUriPathFromRelativePath(options.workspace, file)
            openFile(client, uri)
        }
    }
    
    const id = await client.request('chat/new', null)
    const reply = await client.request('chat/submitMessage', {
            id,
            message: {
                command: 'submit',
                text: chatEvalConfig.question,
                submitType: 'user',
                addEnhancedContext: options.fixture?.webViewConfiguration?.useEnhancedContext ?? false,
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
