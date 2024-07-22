import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

import {
    type DocumentContext,
    getActiveTraceAndSpanId,
    isAbortError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { logError } from '../log'
import type { CompletionIntent } from '../tree-sitter/query-sdk'

import { isValidTestFile } from '../commands/utils/test-commands'
import { gitMetadataForCurrentEditor } from '../repository/git-metadata-for-editor'
import { RepoMetadatafromGitApi } from '../repository/repo-metadata-from-git-api'
import type { ContextMixer } from './context/context-mixer'
import { getCompletionProvider } from './get-completion-provider'
import { insertIntoDocContext } from './get-current-doc-context'
import * as CompletionLogger from './logger'
import type { CompletionLogID } from './logger'
import type { CompletionProviderTracer, ProviderConfig } from './providers/provider'
import type { RequestManager, RequestParams } from './request-manager'
import { reuseLastCandidate } from './reuse-last-candidate'
import type { SmartThrottleService } from './smart-throttle'
import type { AutocompleteItem } from './suggested-autocomplete-items-cache'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import type { ProvideInlineCompletionsItemTraceData } from './tracer'
import { sleep } from './utils'

export interface InlineCompletionsParams {
    // Context
    document: vscode.TextDocument
    position: vscode.Position
    triggerKind: TriggerKind
    selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined
    docContext: DocumentContext
    completionIntent?: CompletionIntent
    lastAcceptedCompletionItem?: Pick<AutocompleteItem, 'requestParams' | 'analyticsItem'>

    // Prompt parameters
    providerConfig: ProviderConfig

    // Shared
    requestManager: RequestManager
    contextMixer: ContextMixer
    smartThrottleService: SmartThrottleService | null
    stageRecorder: CompletionLogger.AutocompleteStageRecorder

    // UI state
    isDotComUser: boolean
    lastCandidate?: LastInlineCompletionCandidate
    debounceInterval?: { singleLine: number; multiLine: number }
    setIsLoading?: (isLoading: boolean) => void

    // Execution
    abortSignal?: AbortSignal
    cancellationListener?: vscode.Disposable
    tracer?: (data: Partial<ProvideInlineCompletionsItemTraceData>) => void
    artificialDelay?: number
    firstCompletionTimeout: number

    // Feature flags
    completeSuggestWidgetSelection?: boolean

    // Callbacks to accept completions
    handleDidAcceptCompletionItem?: (
        completion: Pick<AutocompleteItem, 'requestParams' | 'logId' | 'analyticsItem' | 'trackedRange'>
    ) => void
    handleDidPartiallyAcceptCompletionItem?: (
        completion: Pick<AutocompleteItem, 'logId' | 'analyticsItem'>,
        acceptedLength: number
    ) => void
}

/**
 * The last-suggested ghost text result, which can be reused if it is still valid.
 */
export interface LastInlineCompletionCandidate {
    /** The document URI for which this candidate was generated. */
    uri: URI

    /** The doc context item */
    lastTriggerDocContext: DocumentContext

    /** The position at which this candidate was generated. */
    lastTriggerPosition: vscode.Position

    /** The selected info item. */
    lastTriggerSelectedCompletionInfo: vscode.SelectedCompletionInfo | undefined

    /** The previously suggested result. */
    result: InlineCompletionsResult
}

/**
 * The result of a call to {@link getInlineCompletions}.
 */
export interface InlineCompletionsResult {
    /** The unique identifier for logging this result. */
    logId: CompletionLogID

    /** Where this result was generated from. */
    source: InlineCompletionsResultSource

    /** The completions. */
    items: InlineCompletionItemWithAnalytics[]

    /**
     * If the request has become stale.
     * This will be the case if it is left in-flight but superseded by a newer request.
     */
    stale?: boolean
}

/**
 * The source of the inline completions result. Using numerical values so telemetry can be recorded on `metadata`
 */
export enum InlineCompletionsResultSource {
    Network = 'Network',
    Cache = 'Cache',
    HotStreak = 'HotStreak',
    CacheAfterRequestStart = 'CacheAfterRequestStart',

    /**
     * The user is typing as suggested by the currently visible ghost text. For example, if the
     * user's editor shows ghost text `abc` ahead of the cursor, and the user types `ab`, the
     * original completion should be reused because it is still relevant.
     *
     * The last suggestion is passed in {@link InlineCompletionsParams.lastCandidate}.
     */
    LastCandidate = 'LastCandidate',
}
/**
 * Create a mapping of all inline completion sources to numerical values, so telemetry can be recorded on `metadata`.
 */
export const InlineCompletionsResultSourceTelemetryMetadataMapping: Record<
    InlineCompletionsResultSource,
    number
> = {
    [InlineCompletionsResultSource.Network]: 1,
    [InlineCompletionsResultSource.Cache]: 2,
    [InlineCompletionsResultSource.HotStreak]: 3,
    [InlineCompletionsResultSource.CacheAfterRequestStart]: 4,
    [InlineCompletionsResultSource.LastCandidate]: 5,
}
/**
 * Extends the default VS Code trigger kind to distinguish between manually invoking a completion
 * via the keyboard shortcut and invoking a completion via hovering over ghost text.
 */
export enum TriggerKind {
    /** Completion was triggered explicitly by a user hovering over ghost text. */
    Hover = 'Hover',

    /** Completion was triggered automatically while editing. */
    Automatic = 'Automatic',

    /** Completion was triggered manually by the user invoking the keyboard shortcut. */
    Manual = 'Manual',

    /** When the user uses the suggest widget to cycle through different completions. */
    SuggestWidget = 'SuggestWidget',
}
export const TriggerKindTelemetryMetadataMapping: Record<TriggerKind, number> = {
    [TriggerKind.Hover]: 1,
    [TriggerKind.Automatic]: 2,
    [TriggerKind.Manual]: 3,
    [TriggerKind.SuggestWidget]: 4,
}

export function allTriggerKinds(): TriggerKind[] {
    return [TriggerKind.Automatic, TriggerKind.Hover, TriggerKind.Manual, TriggerKind.SuggestWidget]
}

export async function getInlineCompletions(
    params: InlineCompletionsParams
): Promise<InlineCompletionsResult | null> {
    try {
        const result = await doGetInlineCompletions(params)
        params.tracer?.({ result })
        return result
    } catch (unknownError: unknown) {
        console.log('ERROR?')
        const error = unknownError instanceof Error ? unknownError : new Error(unknownError as any)

        params.tracer?.({ error: error.toString() })

        if (isAbortError(error)) {
            return null
        }

        if (process.env.NODE_ENV === 'development') {
            // Log errors to the console in the development mode to see the stack traces with source maps
            // in Chrome dev tools.
            console.error(error)
        }

        logError('getInlineCompletions:error', error.message, error.stack, { verbose: { error } })
        CompletionLogger.logError(error)

        throw error
    } finally {
        params.setIsLoading?.(false)
    }
}

async function doGetInlineCompletions(
    params: InlineCompletionsParams
): Promise<InlineCompletionsResult | null> {
    const {
        document,
        position,
        triggerKind,
        selectedCompletionInfo,
        docContext,
        docContext: { multilineTrigger, currentLineSuffix, currentLinePrefix },
        providerConfig,
        contextMixer,
        smartThrottleService,
        requestManager,
        lastCandidate,
        debounceInterval,
        setIsLoading,
        abortSignal,
        cancellationListener,
        tracer,
        handleDidAcceptCompletionItem,
        handleDidPartiallyAcceptCompletionItem,
        artificialDelay,
        firstCompletionTimeout,
        completionIntent,
        lastAcceptedCompletionItem,
        isDotComUser,
        stageRecorder,
    } = params

    console.log('INSIDE DO GET')
    tracer?.({ params: { document, position, triggerKind, selectedCompletionInfo } })

    const gitIdentifiersForFile =
        isDotComUser === true ? gitMetadataForCurrentEditor.getGitIdentifiersForFile() : undefined
    if (gitIdentifiersForFile?.gitUrl) {
        const repoMetadataInstance = RepoMetadatafromGitApi.getInstance()
        // Calling this so that it precomputes the `gitRepoUrl` and store in its cache for query later.
        repoMetadataInstance.getRepoMetadataUsingGitUrl(gitIdentifiersForFile.gitUrl)
    }

    // If we have a suffix in the same line as the cursor and the suffix contains any word
    // characters, do not attempt to make a completion. This means we only make completions if
    // we have a suffix in the same line for special characters like `)]}` etc.
    //
    // VS Code will attempt to merge the remainder of the current line by characters but for
    // words this will easily get very confusing.
    if (triggerKind !== TriggerKind.Manual && /\w/.test(currentLineSuffix)) {
        return null
    }

    // Do not trigger when the last character is a closing symbol
    if (triggerKind !== TriggerKind.Manual && /[);\]}]$/.test(currentLinePrefix.trim())) {
        return null
    }

    // Do not trigger when cursor is at the start of the file ending line and the line above is empty
    if (
        triggerKind !== TriggerKind.Manual &&
        position.line !== 0 &&
        position.line === document.lineCount - 1
    ) {
        const lineAbove = Math.max(position.line - 1, 0)
        if (document.lineAt(lineAbove).isEmptyOrWhitespace && !position.character) {
            return null
        }
    }

    // Do not trigger when the user just accepted a single-line completion
    if (
        triggerKind !== TriggerKind.Manual &&
        lastAcceptedCompletionItem &&
        lastAcceptedCompletionItem.requestParams.document.uri.toString() === document.uri.toString() &&
        lastAcceptedCompletionItem.requestParams.docContext.multilineTrigger === null
    ) {
        const docContextOfLastAcceptedAndInsertedCompletionItem = insertIntoDocContext({
            docContext: lastAcceptedCompletionItem.requestParams.docContext,
            insertText: lastAcceptedCompletionItem.analyticsItem.insertText,
            languageId: lastAcceptedCompletionItem.requestParams.document.languageId,
        })
        if (
            docContext.prefix === docContextOfLastAcceptedAndInsertedCompletionItem.prefix &&
            docContext.suffix === docContextOfLastAcceptedAndInsertedCompletionItem.suffix &&
            docContext.position.isEqual(docContextOfLastAcceptedAndInsertedCompletionItem.position)
        ) {
            return null
        }
    }

    stageRecorder.record('preLastCandidate')

    // Check if the user is typing as suggested by the last candidate completion (that is shown as
    // ghost text in the editor), and reuse it if it is still valid.
    const resultToReuse =
        triggerKind !== TriggerKind.Manual && lastCandidate
            ? reuseLastCandidate({
                  document,
                  position,
                  lastCandidate,
                  docContext,
                  selectedCompletionInfo,
                  handleDidAcceptCompletionItem,
                  handleDidPartiallyAcceptCompletionItem,
              })
            : null

    if (resultToReuse) {
        return resultToReuse
    }

    // Only log a completion as started if it's either served from cache _or_ the debounce interval
    // has passed to ensure we don't log too many start events where we end up not doing any work at
    // all.
    CompletionLogger.flushActiveSuggestionRequests(isDotComUser)
    const multiline = Boolean(multilineTrigger)
    let logId = CompletionLogger.create({
        multiline,
        triggerKind,
        providerIdentifier: providerConfig.identifier,
        providerModel: providerConfig.model,
        languageId: document.languageId,
        testFile: isValidTestFile(document.uri),
        completionIntent,
        artificialDelay,
        traceId: getActiveTraceAndSpanId()?.traceId,
        stageTimings: stageRecorder.stageTimings,
    })
    stageRecorder.setLogId(logId)

    let requestParams: RequestParams = {
        document,
        docContext,
        position,
        selectedCompletionInfo,
        abortSignal,
    }

    stageRecorder.record('preCache')
    const cachedResult = requestManager.checkCache({
        requestParams,
        isCacheEnabled: triggerKind !== TriggerKind.Manual,
    })
    if (cachedResult) {
        const { completions, source, isFuzzyMatch } = cachedResult

        CompletionLogger.start(logId)
        CompletionLogger.loaded({
            logId,
            requestParams,
            completions,
            source,
            isFuzzyMatch,
            isDotComUser,
        })

        return {
            logId,
            items: completions,
            source,
        }
    }

    /**
     * A request becomes stale if it is left in-flight but superseded by another request.
     * This only applies to the smart throttle.
     */
    let stale: boolean | undefined
    const markRequestAsStale = () => {
        stale = true
    }

    if (smartThrottleService) {
        // For the smart throttle to work correctly and preserve tail requests, we need full control
        // over the cancellation logic for each request.
        // Therefore we must stop listening for cancellation events originating from VS Code.
        cancellationListener?.dispose()

        stageRecorder.record('preSmartThrottle')
        const throttledRequest = await smartThrottleService.throttle(
            requestParams,
            triggerKind,
            markRequestAsStale
        )
        if (throttledRequest === null) {
            return null
        }

        requestParams = throttledRequest
    }

    stageRecorder.record('preDebounce')
    const debounceTime = smartThrottleService
        ? 0
        : triggerKind !== TriggerKind.Automatic
          ? 0
          : ((multiline ? debounceInterval?.multiLine : debounceInterval?.singleLine) ?? 0) +
            (artificialDelay ?? 0)

    // We split the desired debounceTime into two chunks. One that is at most 25ms where every
    // further execution is halted...
    const waitInterval = Math.min(debounceTime, 25)
    // ...and one for the remaining time where we can already start retrieving context in parallel.
    const remainingInterval = debounceTime - waitInterval
    if (waitInterval > 0) {
        await wrapInActiveSpan('autocomplete.debounce.wait', () => sleep(waitInterval))
        if (abortSignal?.aborted) {
            return null
        }
    }

    setIsLoading?.(true)
    CompletionLogger.start(logId)
    stageRecorder.record('preContextRetrieval')

    // Fetch context and apply remaining debounce time
    const [contextResult] = await Promise.all([
        wrapInActiveSpan('autocomplete.retrieve', () =>
            contextMixer.getContext({
                document,
                position,
                docContext,
                abortSignal,
                maxChars: providerConfig.contextSizeHints.totalChars,
                lastCandidate,
            })
        ),
        remainingInterval > 0
            ? wrapInActiveSpan('autocomplete.debounce.remaining', () => sleep(remainingInterval))
            : null,
    ])

    if (abortSignal?.aborted) {
        return null
    }

    tracer?.({ context: contextResult })

    let gitContext = undefined
    if (gitIdentifiersForFile?.gitUrl) {
        gitContext = {
            repoName: gitIdentifiersForFile.gitUrl,
        }
    }

    const completionProvider = getCompletionProvider({
        document,
        position,
        triggerKind,
        providerConfig,
        docContext,
        firstCompletionTimeout,
        completionLogId: logId,
        gitContext,
    })
    console.log('Got completion provider', position)

    tracer?.({
        completers: [
            {
                ...completionProvider.options,
                completionIntent,
            },
        ],
    })

    CompletionLogger.networkRequestStarted(logId, contextResult?.logSummary)
    stageRecorder.record('preNetworkRequest')

    // Get the processed completions from providers
    console.log('calling request manager')
    const { completions, source, updatedLogId } = await requestManager.request({
        logId: logId,
        requestParams,
        provider: completionProvider,
        context: contextResult?.context ?? [],
        isCacheEnabled: triggerKind !== TriggerKind.Manual,
        tracer: tracer ? createCompletionProviderTracer(tracer) : undefined,
    })

    if (updatedLogId !== undefined) {
        // If we have a new `updatedLogId`, we need to use this.
        // This will usually be because we have determine that we want to re-use an existing result
        // from the request manager. For example, if a result is recycled for this in-flight request,
        // we will use the logId of the recycled result, ensuring that we do not have duplicate logging.
        logId = updatedLogId
    }

    const inlineContextParams = {
        context: contextResult?.context,
        filePath: gitIdentifiersForFile?.filePath,
        gitUrl: gitIdentifiersForFile?.gitUrl,
        commit: gitIdentifiersForFile?.commit,
    }
    CompletionLogger.loaded({
        logId,
        requestParams,
        completions,
        source,
        isDotComUser,
        inlineContextParams,
        isFuzzyMatch: false,
    })

    return {
        logId,
        items: completions,
        source,
        stale,
    }
}

function createCompletionProviderTracer(
    tracer: InlineCompletionsParams['tracer']
): CompletionProviderTracer | undefined {
    return (
        tracer && {
            params: data => tracer({ completionProviderCallParams: data }),
            result: data => tracer({ completionProviderCallResult: data }),
        }
    )
}
