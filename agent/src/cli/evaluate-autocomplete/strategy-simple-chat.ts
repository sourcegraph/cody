import * as path from 'path'
import fs from 'fs';
import type { ExtensionMessage } from '../../../../vscode/src/chat/protocol'
import { type MessageHandler } from '../../jsonrpc-alias'
import { type EvaluateAutocompleteOptions, SimpleChatEvalConfig, EvaluationFixture } from './evaluate-autocomplete'
import { exit } from 'process'
import { Semaphore } from 'async-mutex';
import { Uri } from 'vscode'
import { type NotificationMethodName } from '../../jsonrpc-alias'
import fspromises from 'fs/promises'
import { AgentTextDocument } from '../../AgentTextDocument'
import { StrategySimpleChatLogs } from './strategy-simple-chat-logs'

function getMetaDataInfo(options: EvaluateAutocompleteOptions): [string, StrategySimpleChatLogs] {
    const { workspace } = options
    const { chatLogs } = options
    const repoDisplayName = workspace.split("/").at(-1);
    if(repoDisplayName===undefined){
        console.log(`repoDisplay name undefined for the workspace: ${workspace}`)
        exit(1);
    }
    if(chatLogs===undefined){
        console.log(`chat logs data undefined for the workspace: ${workspace}`)
        exit(1)
    }
    return [repoDisplayName, chatLogs]
}

export async function evaluateSimpleChatStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions
): Promise<void> {
    const [repoDisplayName, chatLogs] = getMetaDataInfo(options)

    await createEmbeddings(client, options)
    chatLogs.writeLog(repoDisplayName, `Embeddings creation done for repo: ${repoDisplayName}`)

    await simulateWorkspaceChat(client, options)
    chatLogs.writeLog(repoDisplayName, `Simulation chat done for repo: ${repoDisplayName}`)
}

// ================== Handle embeddings creation =====================

interface EmbeddingFlag {
    isEmbeddingReady: boolean,
    isNumItemNeedIndexZero: boolean,
    isSearchIndexReady: boolean,
}

async function createEmbeddings(client: MessageHandler, options: EvaluateAutocompleteOptions): Promise<void> {
    const [repoDisplayName, chatLogs] = getMetaDataInfo(options)
    const {workspace} = options
    let embeddingDoneFlag: EmbeddingFlag = {
        isEmbeddingReady: false,
        isNumItemNeedIndexZero: false,
        isSearchIndexReady: false,
    }
    registerEmbeddingsHandlers(client, repoDisplayName, embeddingDoneFlag, chatLogs, workspace)

    if(options.fixture?.webViewConfiguration?.useEnhancedContext){
        // todo: remove this behaviour Update embeddings anyways b/c used to fetch the context ranking candidates
        const id = await client.request('chat/new', null)
        await client.request('webview/receiveMessage', { id, message: { command: 'embeddings/index' } })
        await client.request("command/execute", { command: 'cody.embeddings.resolveIssue' })
        await client.request('command/execute', { command: 'cody.search.index-update' })
        await waitForVariable(embeddingDoneFlag)
        await client.request('webview/didDispose', {id})

        await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
        await chatLogs.writeLog(repoDisplayName, `embedding creation completed for repo: ${repoDisplayName}`)
        await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
    }
}

async function addRepoToBlockedRepo(workspaceName: string, repoDisplayName: string): Promise<void> {
    const stringToReplace = `repos/${repoDisplayName}`
    const baseRepoName = path.join(workspaceName.replace(stringToReplace, ''), 'blockedRepos.txt')
    try {
        await fspromises.access(baseRepoName);
    } catch (error) {
        await fspromises.writeFile(baseRepoName, '');
    }
    await fspromises.appendFile(baseRepoName, `${repoDisplayName}\n`);
}

async function addRepoToCompletedRepoLogs(workspaceName: string, repoDisplayName: string): Promise<void> {
    const stringToReplace = `repos/${repoDisplayName}`
    const baseRepoName = path.join(workspaceName.replace(stringToReplace, ''), 'CompletedEmbeddingsRepo.txt')
    try {
        await fspromises.access(baseRepoName);
    } catch (error) {
        await fspromises.writeFile(baseRepoName, '');
    }
    await fspromises.appendFile(baseRepoName, `${repoDisplayName}\n`);
}

function registerEmbeddingsHandlers(client: MessageHandler, repoDisplayName: string, embeddingDoneFlag: EmbeddingFlag, 
    chatLogs: StrategySimpleChatLogs, workspaceName: string): void {
    // override existing debug message
    client.registerNotification('debug/message', async param => {
        await chatLogs.writeLog(repoDisplayName, `debug/message: ${JSON.stringify(param)}`)

        // Add handler for the index length here
        if(param.channel==='Cody by Sourcegraph'){
            const debug_message = param.message

            if (debug_message.startsWith('█ LocalEmbeddingsController: index-health ')) {
                const jsonString = debug_message.replace('█ LocalEmbeddingsController: index-health ', '')
                await chatLogs.writeLog(repoDisplayName, `Got index-health message for repo: ${repoDisplayName}, message: ${jsonString}`)
                try {
                    const indexHealthObj = JSON.parse(jsonString)
                    if(indexHealthObj.numItemsNeedEmbedding===0){
                        await addRepoToCompletedRepoLogs(workspaceName, repoDisplayName)
                        embeddingDoneFlag.isNumItemNeedIndexZero = true
                        await chatLogs.writeLog(repoDisplayName, `embeddingDoneFlag.isNumItemNeedIndexZero is ready for repo: ${repoDisplayName}, setting flag to true. Flag val: ${JSON.stringify(embeddingDoneFlag)}`)
                    }
                } catch (error) {
                    await chatLogs.writeLog(repoDisplayName, `Got error while trying to parse the index-health message: ${jsonString}, error is: ${error}`)
                }
            }
            else if(debug_message.includes('Access denied | sourcegraph.com used Cloudflare to restrict access')) {
                await chatLogs.writeLog(repoDisplayName, `SourceGraph restricted access message: ${debug_message}`)
                await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
                await chatLogs.writeLog(repoDisplayName, `Access denied | sourcegraph.com used Cloudflare to restrict access`)
                await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
                exit(1)
            } else if(debug_message.includes('█ CodyEngine: stderr error: Cody Gateway request failed: 403 Forbidden')){
                await addRepoToBlockedRepo(workspaceName, repoDisplayName)
                await chatLogs.writeLog(repoDisplayName, `SourceGraph restricted access message: ${debug_message}`)
                await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
                await chatLogs.writeLog(repoDisplayName, `█ CodyEngine: stderr error: Cody Gateway request failed: 403 Forbidden`)
                await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
                embeddingDoneFlag.isNumItemNeedIndexZero = true

                // exit(1)
            }
        }
    })

    client.registerNotification('webview/postMessage', async (param) => {
        await chatLogs.writeLog(repoDisplayName, `webview/postMessage: ${JSON.stringify(param)}`)
        
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
                    await chatLogs.writeLog(repoDisplayName, `embeddingDoneFlag.isEmbeddingReady is ready for repo: ${repoDisplayName}, setting flag to true. Flag val: ${JSON.stringify(embeddingDoneFlag)}`)
                }
                if(search_state.length > 0 && search_state[0].state === "ready") {
                    embeddingDoneFlag.isSearchIndexReady = true
                    await chatLogs.writeLog(repoDisplayName, `embeddingDoneFlag.isSearchIndexReady is ready for repo: ${repoDisplayName}, setting flag to true. Flag val: ${JSON.stringify(embeddingDoneFlag)}`)
                }
                break;
            default:
                break;
        }
    })
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

async function appendAllContextCandidatesToFile(file_path: string, jsonString: string) {
    if (!fs.existsSync(file_path)) {
        await fspromises.mkdir(path.dirname(file_path), { recursive: true })
        await fspromises.writeFile(file_path, jsonString+'\n');
    } else {
        await  fspromises.appendFile(file_path, jsonString+'\n');
    }
}

async function simulateWorkspaceChat(client: MessageHandler, options: EvaluateAutocompleteOptions): Promise<void> {
    const [repoDisplayName, chatLogs] = getMetaDataInfo(options)
    // client.registerNotification('debug/message', async param => await chatLogs.writeLog(repoDisplayName, `debug/message: ${JSON.stringify(param)}`))
    // client.registerNotification('webview/postMessage', async param => await chatLogs.writeLog(repoDisplayName, `webview/postMessage: ${JSON.stringify(param)}`))
    client.registerNotification('debug/message', async param => {
        await chatLogs.writeLog(repoDisplayName, `debug/message: ${JSON.stringify(param)}`)

        // Add handler for the index length here
        if(param.channel==='Cody by Sourcegraph'){
            const debug_message = param.message

            if (debug_message.startsWith('█ EnhancedContextAllContext: ')) {
                const jsonString = debug_message.replace('█ EnhancedContextAllContext: ', '')
                await chatLogs.writeLog(repoDisplayName, `Got all candidates as: ${repoDisplayName}, message: ${jsonString}`)
                try {
                    const file_path = path.join(options.snapshotDirectory, 'context-candidates.jsonl')
                    await appendAllContextCandidatesToFile(file_path, jsonString)
                } catch (error) {
                    await chatLogs.writeLog(repoDisplayName, `Got error while trying to parse the index-health message: ${jsonString}, error is: ${error}`)
                }
            }
        }
    })
    client.registerNotification('webview/postMessage', async param => {})

    const all_chat_configs = options.chat_config ?? []
    // const replies: ChatReply[] = []

    // let totalQuestions = all_chat_configs.length
    // for(const single_chat_config of all_chat_configs) {
    //     const reply = await simulateChatInRepo(client, options, single_chat_config)
    //     replies.push(reply)
    //     totalQuestions-=1
    //     await chatLogs.writeLog(repoDisplayName, `Number of questions remaining: ${totalQuestions}`)
    // }

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
        await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
        await chatLogs.writeLog(repoDisplayName, `length of replies is 0 ${replies}`)
        exit(1)
    }

    await saveListToFile(replies, path.join(options.snapshotDirectory, 'strategy-chat.json'))
    await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
    await chatLogs.writeLog(repoDisplayName, `Saved results for workspace ${options.workspace}`)
    await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
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
    const [repoDisplayName, chatLogs] = getMetaDataInfo(options)
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
    
    checkInvalidReplyAndExit(chatLogs, repoDisplayName, reply)

    await client.request('webview/didDispose', {id})
    return {
        repo_path: options.workspace,
        question: chatEvalConfig.question,
        ground_truth_answer: chatEvalConfig.ground_truth_answer,
        reply: reply,
        fixture: options.fixture,
    }
}

async function checkInvalidReplyAndExit(chatLogs: StrategySimpleChatLogs, repoDisplayName: string, reply: ExtensionMessage): Promise<Promise<Promise<Promise<void>>>> {
    if (reply.type === 'transcript') {
        const llm_reply_message = reply.messages.at(-1)
        if (llm_reply_message == undefined || llm_reply_message.error)  {
            await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
            await chatLogs.writeLog(repoDisplayName, `Error: expected transcript, got unexpected reply: ${JSON.stringify(reply)}`)
            exit(1)
        }
        return
    }
    await chatLogs.writeLog(repoDisplayName, '--------- --------- --------- --------- --------- --------- ---------')
    await chatLogs.writeLog(repoDisplayName, `Error: expected transcript, got unexpected reply: ${JSON.stringify(reply)}`)
    exit(1)
}

async function saveListToFile(list: any[], filePath: string): Promise<void> {
    const data = JSON.stringify(list)
    await fspromises.mkdir(path.dirname(filePath), { recursive: true })
    await fspromises.writeFile(filePath, data)
}

// ====================================================================
