import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    type CompletionParameters,
    Typewriter,
    currentAuthStatus,
    currentSiteVersion,
    firstValueFrom,
    isAbortError,
    isDotCom,
    isNetworkLikeError,
    logDebug,
    modelsService,
    posixFilePaths,
    telemetryRecorder,
    uriBasename,
    wrapInActiveSpan,
    graphqlClient,
    isError,
    ps,
    PromptString,
} from '@sourcegraph/cody-shared'


import type { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { logError } from '../output-channel-logger'

import {
    ChatMessage,
    DEFAULT_EVENT_SOURCE,
    EventSourceTelemetryMetadataMapping,
} from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { workspace, Range, Position } from 'vscode'
import { doesFileExist } from '../commands/utils/workspace-files'
import { getEditor } from '../editor/active-editor'
import { CodyTaskState } from '../non-stop/state'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import { resolveRelativeOrAbsoluteUri } from '../services/utils/edit-create-file'
import type { EditManagerOptions } from './manager'
import { responseTransformer } from './output/response-transformer'
import { buildInteraction } from './prompt'
import { PROMPT_TOPICS } from './prompt/constants'
import { EditIntentTelemetryMetadataMapping, EditModeTelemetryMetadataMapping } from './types'
import { isStreamedIntent } from './utils/edit-intent'
import { remoteReposForAllWorkspaceFolders } from '../repository/remoteRepos'
import { doRangesIntersect } from '@sourcegraph/cody-shared/src/common/range'
import { CodeGraphOccurrence } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import * as cp from 'node:child_process'
import { CLOSING_CODE_TAG, OPENING_CODE_TAG } from '../completions/text-processing'
import { gitCommitIdFromGitExtension } from '../repository/git-extension-api'

interface EditProviderOptions extends EditManagerOptions {
    task: FixupTask
    controller: FixupController
}

async function findScope(content: string, line: number, character: number): Promise<string> {
    const promise = new Promise<string>((resolve, reject) => {
        const process = cp.exec(
            `scip-syntax chunk --line=${line} --character=${character} --language=go -`,
            (err, stdout, stderr) => {
                if (err !== null) {
                    logDebug("SCIP ERROR", err.message, stderr)
                    reject(err)
                } else {
                    resolve(stdout)
                }
            }
        );
        process.stdin?.write(content)
        process.stdin?.end()
    })
    return promise
}

type Usage = {
    repository: string,
    revision: string,
    path: string,
    range: Range,
    isDefinition: boolean,
}

/**
 * Fetches all symbol usages for a given occurrence in a repository.
 * Handles pagination by making multiple requests until all usages are retrieved.
 * @param repo Repository name
 * @param commit Commit hash
 * @param path File path
 * @param occurrence Symbol occurrence to find usages for
 * @returns Array of symbol usages with location and definition information
 */
async function occurrenceUsages(repo: string, commit: string, path: string, occurrence: CodeGraphOccurrence): Promise<Usage[]> {
    let allUsages: Usage[] = [];
    let cursor: string | undefined;
    while (allUsages.length < 300) {
        const usages = await graphqlClient.getSymbolUsages(repo, commit, path, occurrence, cursor)
        if (isError(usages)) {
            logDebug("USAGES ERROR", usages.message)
            break
        }
        for (const usage of usages.usagesForSymbol.nodes) {
            const { start, end } = usage.usageRange.range
            allUsages.push({
                repository: usage.usageRange.repository,
                revision: usage.usageRange.revision,
                path: usage.usageRange.path,
                range: new Range(
                    new Position(start.line, start.character),
                    new Position(end.line, end.character),
                ),
                isDefinition: usage.usageKind === "DEFINITION",
            })
        }
        if (!usages.usagesForSymbol.pageInfo.hasNextPage) {
            break
        }
        cursor = usages.usagesForSymbol.pageInfo.endCursor
    }
    return allUsages
}

/**
 * Limits the number of usages per repository and total number of repositories.
 * Prioritizes definitions and respects per-repo and total repo limits.
 * @param usages Array of symbol usages to filter
 * @param perRepoLimit Maximum number of usages to include per repository
 * @param repoLimit Maximum number of repositories to include
 * @returns Limited array of usages
 */
function limitUsagesPerRepo(usages: Usage[], perRepoLimit: number, repoLimit: number): Usage[] {
    let repoCount = 0;
    let usagesPerRepo: Record<string, Usage[]> = {}
    for (const usage of usages) {
        if (usagesPerRepo[usage.repository] === undefined && repoLimit > repoCount) {
            usagesPerRepo[usage.repository] = []
            repoCount++
        }
        if (usage.isDefinition) {
            usagesPerRepo[usage.repository].push(usage)
            continue
        }
        if (usagesPerRepo[usage.repository].length < perRepoLimit) {
            usagesPerRepo[usage.repository].push(usage)
        }
    }
    let result: Usage[] = []
    for (const usages of Object.values(usagesPerRepo)) {
        result.push(...usages)
    }
    return result
}

async function collectGraphContext(range: Range): Promise<ChatMessage[]> {
    let currentRepo : string | undefined;
    const repos = await firstValueFrom(remoteReposForAllWorkspaceFolders)
    if (Array.isArray(repos) && repos.length > 0) {
        currentRepo = repos[0].name
    }
    let currentFile : string | undefined; 
    let currentCommit : string | undefined;
    {
        let currentUri = getEditor()?.active?.document?.uri
        if (currentUri !== undefined) {
            currentFile = workspace.asRelativePath(currentUri)
            currentCommit = gitCommitIdFromGitExtension(currentUri)
        }
    }
    logDebug("COORDINATES",
        `${currentRepo}@${currentCommit}/${currentFile}:${range?.start?.line}:${range?.end?.line}`
    )

    let symbolsInRange: CodeGraphOccurrence[] = [];
    const chatMessages: ChatMessage[] = []
    if (currentRepo !== undefined && currentCommit !== undefined && currentFile !== undefined) {
        const codeGraphOccurrences = await graphqlClient.getCodeGraphData(currentRepo, currentCommit, currentFile)
        if (isError(codeGraphOccurrences)) {
            logDebug("CODEGRAPH ERROR", codeGraphOccurrences.message)
        } else {
            if (codeGraphOccurrences.length === 0) {
                logDebug("CODEGRAPH ERROR", "No symbols found")
            }
            symbolsInRange =
              codeGraphOccurrences.filter(occurrence => 
                !occurrence.symbol.startsWith("local ") && doRangesIntersect(occurrence.range, range)
              )
        }

        for (const symbol of symbolsInRange) {
            const usages = await occurrenceUsages(currentRepo, currentCommit, currentFile, symbol)
            if (isError(usages)) {
                logDebug("USAGES ERROR", usages.message)
            } else {
                for (const usage of limitUsagesPerRepo(usages, 3, 10)) {
                    const content = await graphqlClient.getFileContents(
                        usage.repository,
                        usage.path,
                        usage.revision,
                    )
                    if (isError(content)) {
                        continue
                    }
                    const start = usage.range.start
                    const prettySymbol = PromptString.unsafe_fromUserQuery(symbol.symbol.split("/").at(-1)!)
                    try {
                        const scopeChunk = await findScope(content.repository?.commit?.file?.content ?? "", start.line, start.character)
                        const promptChunk = PromptString.unsafe_fromUserQuery(scopeChunk)
                        const promptPath = PromptString.unsafe_fromUserQuery(usage.path)
                        const usageType = usage.isDefinition ? ps`Definition` : ps`Usage`
                        const prompt = ps`${usageType} for symbol ${prettySymbol} from file path '${promptPath}': ${OPENING_CODE_TAG}${promptChunk}${CLOSING_CODE_TAG}`
                        chatMessages.push({ speaker: "human", text: prompt })
                        logDebug("USAGE", usage.repository, usage.path, start.line)
                        logDebug(`SCOPE CHUNK (${usageType})`, scopeChunk)
                    } catch (err: any) {
                        logDebug("SCIP ERROR", err.message)
                    }
                }
            }
        }
    }
    logDebug("MATCHED SYMBOLS", JSON.stringify(symbolsInRange.map(s => s.symbol)))
    const bytes = chatMessages.reduce((acc, msg) => acc + (msg.text?.length ?? 0), 0) / 4;
    logDebug("ADDED TOKENS COUNT", bytes.toString())
    return chatMessages
}

// Initiates a completion and responds to the result from the LLM. Implements
// "tools" like directing the response into a specific file. Code is forwarded
// to the FixupTask.
export class EditProvider {
    private insertionQueue: { response: string; isMessageInProgress: boolean }[] = []
    private insertionInProgress = false
    private abortController: AbortController | null = null

    constructor(public config: EditProviderOptions) {}

    public async startEdit(): Promise<void> {
        return wrapInActiveSpan('command.edit.start', async span => {
            const chatMessages = await collectGraphContext(this.config.task.originalRange)
            this.config.controller.startTask(this.config.task)
            const model = this.config.task.model
            const contextWindow = modelsService.getContextWindowByID(model)
            const versions = await currentSiteVersion()
            if (!versions) {
                throw new Error('unable to determine site version')
            }
            const {
                messages,
                stopSequences,
                responseTopic,
                responsePrefix = '',
            } = await buildInteraction({
                model,
                codyApiVersion: versions.codyAPIVersion,
                contextWindow: contextWindow.input,
                task: this.config.task,
                editor: this.config.editor,
            }).catch(err => {
                this.handleError(err)
                throw err
            })
            messages.push(...chatMessages)

            const multiplexer = new BotResponseMultiplexer()

            const typewriter = new Typewriter({
                update: content => {
                    void this.handleResponse(content, true)
                },
                close: () => {},
            })

            let text = ''
            multiplexer.sub(responseTopic, {
                onResponse: async (content: string) => {
                    text += content
                    typewriter.update(text)
                    return Promise.resolve()
                },
                onTurnComplete: async () => {
                    typewriter.close()
                    typewriter.stop()
                    void this.handleResponse(text, false)
                    return Promise.resolve()
                },
            })
            if (this.config.task.intent === 'test') {
                if (this.config.task.destinationFile) {
                    // We have already provided a destination file,
                    // Treat this as the test file to insert to
                    await this.config.controller.didReceiveNewFileRequest(
                        this.config.task.id,
                        this.config.task.destinationFile
                    )
                }

                // Listen to test file name suggestion from responses and create the file if we don't have one.
                // This allows Cody to let us know which test file we should add the new content to.
                // NOTE: Keep this multiplexer even if a destination file is set to catch the PROMPT_TOPICS.
                let filepath = ''
                multiplexer.sub(PROMPT_TOPICS.FILENAME.toString(), {
                    onResponse: async (content: string) => {
                        filepath += content
                        // handleFileCreationResponse will verify if task.destinationFile is set before creating a new file.
                        void this.handleFileCreationResponse(filepath, true)
                        return Promise.resolve()
                    },
                    onTurnComplete: async () => {
                        return Promise.resolve()
                    },
                })
            }

            this.abortController = new AbortController()
            const params = {
                model,
                stopSequences,
                maxTokensToSample: contextWindow.output,
            } as CompletionParameters
            // Set stream param only when the model is disabled for streaming.
            if (modelsService.isStreamDisabled(model)) {
                params.stream = false
            }
            const stream = await this.config.chat.chat(
                messages,
                { ...params },
                this.abortController.signal
            )

            let textConsumed = 0
            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        if (textConsumed === 0 && responsePrefix) {
                            void multiplexer.publish(responsePrefix)
                        }
                        const text = message.text.slice(textConsumed)
                        textConsumed += text.length
                        void multiplexer.publish(text)
                        break
                    }
                    case 'complete': {
                        void multiplexer.notifyTurnComplete()
                        break
                    }
                    case 'error': {
                        let err = message.error
                        logError('EditProvider:onError', err.message)

                        if (isAbortError(err)) {
                            void this.handleResponse(text, false)
                            return
                        }

                        if (isNetworkLikeError(err)) {
                            err = new Error('Cody could not respond due to network error.')
                        }

                        // Display error message as assistant response
                        this.handleError(err)
                        console.error(`Completion request failed: ${err.message}`)

                        break
                    }
                }
            }
        })
    }

    public abortEdit(): void {
        this.abortController?.abort()
    }

    /**
     * Given a response, allows applying an edit directly.
     * This is a shortcut to creating an edit without calling `executeEdit`.
     * Should **only** be used for completed edits.
     */
    public applyEdit(response: string): Promise<void> {
        // We need to start the task first, before applying
        this.config.controller.startTask(this.config.task)
        return this.handleResponse(response, false)
    }

    private async handleResponse(response: string, isMessageInProgress: boolean): Promise<void> {
        // Error state: The response finished but we didn't receive any text
        if (!response && !isMessageInProgress) {
            this.handleError(new Error('Cody did not respond with any text'))
        }

        if (!response) {
            return
        }

        // If the response finished and we didn't receive a test file name suggestion,
        // we will create one manually before inserting the response to the new test file
        if (this.config.task.intent === 'test' && !this.config.task.destinationFile) {
            if (isMessageInProgress) {
                return
            }
            await this.handleFileCreationResponse('', isMessageInProgress)
        }

        if (!isMessageInProgress) {
            const { task } = this.config
            const legacyMetadata = {
                intent: EditIntentTelemetryMetadataMapping[task.intent] || task.intent,
                mode: EditModeTelemetryMetadataMapping[task.mode] || task.mode,
                source:
                    EventSourceTelemetryMetadataMapping[task.source || DEFAULT_EVENT_SOURCE] ||
                    task.source,
                ...countCode(response),
            }
            const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
            const endpoint = currentAuthStatus().endpoint
            telemetryRecorder.recordEvent('cody.fixup.response', 'hasCode', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                    // 🚨 SECURITY: edit responses are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an aditional safegaurd measure
                    responseText: endpoint && isDotCom(endpoint) ? response : undefined,
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        }

        if (isStreamedIntent(this.config.task.intent)) {
            this.queueInsertion(response, isMessageInProgress)
        } else {
            this.handleFixupEdit(response, isMessageInProgress)
        }
    }

    private queueInsertion(response: string, isMessageInProgress: boolean): void {
        this.insertionQueue.push({ response, isMessageInProgress })
        if (!this.insertionInProgress) {
            this.processQueue()
        }
    }

    private async processQueue(): Promise<void> {
        this.insertionInProgress = true
        while (this.insertionQueue.length > 0) {
            const { response, isMessageInProgress } = this.insertionQueue.shift()!
            await this.handleFixupInsert(response, isMessageInProgress)
        }
        this.insertionInProgress = false
    }

    /**
     * Display an erred codelens to the user on failed fixup apply.
     * Will allow the user to view the error in more detail if needed.
     */
    protected handleError(error: Error): void {
        this.config.controller.error(this.config.task.id, error)
    }

    private async handleFixupEdit(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.controller.didReceiveFixupText(
            this.config.task.id,
            responseTransformer(response, this.config.task, isMessageInProgress),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFixupInsert(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.controller.didReceiveFixupInsertion(
            this.config.task.id,
            responseTransformer(response, this.config.task, isMessageInProgress),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFileCreationResponse(text: string, isMessageInProgress: boolean): Promise<void> {
        const task = this.config.task
        if (task.state !== CodyTaskState.Pending) {
            return
        }

        // Has already been created when set
        if (task.destinationFile) {
            return
        }

        // Manually create the file if no name was suggested
        if (!text.length && !isMessageInProgress) {
            // Create a new untitled file if the suggested file does not exist
            const currentFile = task.fixupFile.uri
            const currentDoc = await workspace.openTextDocument(currentFile)
            const newDoc = await workspace.openTextDocument({
                language: currentDoc?.languageId,
            })
            await this.config.controller.didReceiveNewFileRequest(this.config.task.id, newDoc.uri)
            return
        }

        const opentag = `<${PROMPT_TOPICS.FILENAME}>`
        const closetag = `</${PROMPT_TOPICS.FILENAME}>`

        const currentFileUri = task.fixupFile.uri
        // remove open and close tags from text
        const newFilePath = text.trim().replaceAll(new RegExp(`${opentag}(.*)${closetag}`, 'g'), '$1')

        // Get workspace uri using the current file uri
        const workspaceUri = workspace.getWorkspaceFolder(currentFileUri)?.uri
        const currentDirUri = Utils.joinPath(currentFileUri, '..')
        const activeEditor = getEditor()?.active?.document?.uri
        let newFileUri = await resolveRelativeOrAbsoluteUri(
            workspaceUri ?? currentDirUri,
            newFilePath,
            activeEditor
        )
        if (!newFileUri) {
            throw new Error('No editor found to insert text')
        }

        const haveSameExtensions =
            posixFilePaths.extname(uriBasename(currentFileUri)) === posixFilePaths.extname(newFilePath)
        if (haveSameExtensions && !task.destinationFile) {
            const fileIsFound = await doesFileExist(newFileUri)
            if (!fileIsFound) {
                newFileUri = newFileUri.with({ scheme: 'untitled' })
            }
            try {
                await this.config.controller.didReceiveNewFileRequest(task.id, newFileUri)
            } catch (error) {
                this.handleError(new Error('Cody failed to generate unit tests', { cause: error }))
            }
        }
    }
}
