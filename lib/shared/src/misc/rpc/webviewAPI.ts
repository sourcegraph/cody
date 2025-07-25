import { type Observable, map } from 'observable-fns'
import type { AuthStatus, ModelsData, ResolvedConfiguration } from '../..'
import type { SerializedPromptEditorState } from '../..'
import type { ChatHistoryType, LightweightChatHistory } from '../../chat/transcript'
import type { ChatMessage, UserLocalHistory } from '../../chat/transcript/messages'
import type { ContextItem, DefaultContext } from '../../codebase-context/messages'
import type { CodyCommand } from '../../commands/types'
import type { FeatureFlag } from '../../experimentation/FeatureFlagProvider'
import type { McpServer } from '../../llm-providers/mcp/types'
import type { ContextMentionProviderMetadata } from '../../mentions/api'
import type { MentionQuery } from '../../mentions/query'
import type { Model } from '../../models/model'
import type {
    FetchHighlightFileParameters,
    Prompt,
    PromptTag,
} from '../../sourcegraph-api/graphql/client'
import { type createMessageAPIForWebview, proxyExtensionAPI } from './rpc'

export interface WebviewToExtensionAPI {
    /**
     * Get the data to display in the @-mention menu for the given query.
     */
    mentionMenuData(query: MentionQuery): Observable<MentionMenuData>

    /**
     * Get the frequently used context items.
     */
    frequentlyUsedContextItems(): Observable<ContextItem[]>

    /**
     * Get the evaluated value of a feature flag.
     */
    evaluatedFeatureFlag(flag: FeatureFlag): Observable<boolean | undefined>

    /**
     * Observe the results of querying prompts in the Prompt Library. For backcompat, it also
     * includes matching builtin commands and custom commands (which are both deprecated in favor of
     * the Prompt Library).
     */
    prompts(input: PromptsInput): Observable<PromptsResult>
    promptTags(input: PromptTagsInput): Observable<PromptTagsResult>
    getCurrentUserId(): Observable<string | null | Error>

    /**
     * List repositories that match the given query for the repository filter in search results.
     */
    repos(input: ReposInput): Observable<ReposResults>

    /**
     * Stream with actions from cody agent service, serves as transport for any client
     * based actions/effects.
     */
    clientActionBroadcast(): Observable<ClientActionBroadcast>

    /** The commands to prompts library migration information. */
    promptsMigrationStatus(): Observable<PromptsMigrationStatus>

    startPromptsMigration(): Observable<void>

    /**
     * The models data, including all available models, site defaults, and user preferences.
     */
    models(): Observable<ModelsData | null>

    /**
     * Observe the list of available chat models.
     */
    chatModels(): Observable<Model[]>

    highlights(query: FetchHighlightFileParameters): Observable<string[][]>

    hydratePromptMessage(
        promptText: string,
        initialContext?: ContextItem[]
    ): Observable<SerializedPromptEditorState>

    /**
     * Set the chat model.
     */
    setChatModel(model: Model['id']): Observable<void>

    /**
     * Observe the default context that should be populated in the chat message input field and suggestions.
     */
    defaultContext(): Observable<DefaultContext>

    /**
     * Observe the current resolved configuration (same as the global {@link resolvedConfig}
     * observable).
     */
    resolvedConfig(): Observable<ResolvedConfiguration>

    /**
     * Observe the current auth status (same as the global {@link authStatus} observable).
     */
    authStatus(): Observable<AuthStatus>

    /**
     * Observe the current transcript.
     */
    transcript(): Observable<readonly ChatMessage[]>

    /**
     * The current user's chat history.
     */
    userHistory(type?: ChatHistoryType): Observable<LightweightChatHistory | UserLocalHistory | null>

    mcpSettings(): Observable<McpServer[] | null>
}

export function createExtensionAPI(
    messageAPI: ReturnType<typeof createMessageAPIForWebview>,

    // As a workaround for Cody Web, support providing static initial context.
    staticDefaultContext?: DefaultContext
): WebviewToExtensionAPI {
    const hydratePromptMessage = proxyExtensionAPI(messageAPI, 'hydratePromptMessage')

    return {
        mentionMenuData: proxyExtensionAPI(messageAPI, 'mentionMenuData'),
        frequentlyUsedContextItems: proxyExtensionAPI(messageAPI, 'frequentlyUsedContextItems'),
        evaluatedFeatureFlag: proxyExtensionAPI(messageAPI, 'evaluatedFeatureFlag'),
        prompts: proxyExtensionAPI(messageAPI, 'prompts'),
        promptTags: proxyExtensionAPI(messageAPI, 'promptTags'),
        getCurrentUserId: proxyExtensionAPI(messageAPI, 'getCurrentUserId'),
        clientActionBroadcast: proxyExtensionAPI(messageAPI, 'clientActionBroadcast'),
        models: proxyExtensionAPI(messageAPI, 'models'),
        chatModels: proxyExtensionAPI(messageAPI, 'chatModels'),
        highlights: proxyExtensionAPI(messageAPI, 'highlights'),
        hydratePromptMessage: promptText =>
            hydratePromptMessage(promptText, staticDefaultContext?.initialContext),
        setChatModel: proxyExtensionAPI(messageAPI, 'setChatModel'),
        defaultContext: () =>
            proxyExtensionAPI(messageAPI, 'defaultContext')().pipe(
                map(result =>
                    staticDefaultContext
                        ? ({
                              ...result,
                              corpusContext: [
                                  ...result.corpusContext,
                                  ...staticDefaultContext.corpusContext,
                              ],
                              initialContext: [
                                  ...result.initialContext,
                                  ...staticDefaultContext.initialContext,
                              ],
                          } satisfies DefaultContext)
                        : result
                )
            ),
        promptsMigrationStatus: proxyExtensionAPI(messageAPI, 'promptsMigrationStatus'),
        startPromptsMigration: proxyExtensionAPI(messageAPI, 'startPromptsMigration'),
        resolvedConfig: proxyExtensionAPI(messageAPI, 'resolvedConfig'),
        authStatus: proxyExtensionAPI(messageAPI, 'authStatus'),
        transcript: proxyExtensionAPI(messageAPI, 'transcript'),
        userHistory: proxyExtensionAPI(messageAPI, 'userHistory'),
        repos: proxyExtensionAPI(messageAPI, 'repos'),
        mcpSettings: proxyExtensionAPI(messageAPI, 'mcpSettings'),
    }
}

export interface MentionMenuData {
    providers: ContextMentionProviderMetadata[]
    items: (ContextItem & { icon?: string })[] | undefined

    /**
     * If an error is present, the client should display the error *and* still display the other
     * data that is present.
     */
    error?: string
}

export interface ReposInput {
    query?: string
    first: number
}

export type ReposResults = { name: string; id: string }[]

export interface PromptAction extends Prompt {
    actionType: 'prompt'
}

export interface CommandAction extends CodyCommand {
    actionType: 'command'
}

export interface PromptsInput {
    query: string
    first?: number
    recommendedOnly: boolean
    tags?: string[]
    owner?: string
    includeViewerDrafts?: boolean
    builtinOnly?: boolean
}

export type Action = PromptAction | CommandAction

export interface PromptsResult {
    arePromptsSupported: boolean

    /** List of all available actions (prompts and/or commands) */
    actions: Action[]

    /** The original query used to fetch this result. */
    query: string
}

export type PromptTagsInput = {
    first?: number
}

export type PromptTagsResult = PromptTag[]

export type PromptsMigrationStatus =
    | InitialPromptsMigrationStatus
    | InProgressPromptsMigrationStatus
    | SuccessfulPromptsMigrationStatus
    | FailedPromptsMigrationStatus
    | PromptsMigrationSkipStatus
    | NoPromptsMigrationNeeded

interface InitialPromptsMigrationStatus {
    type: 'initial_migration'
}

interface InProgressPromptsMigrationStatus {
    type: 'migrating'

    /**
     * Current number of commands that we've migrated during the current session
     * (current migration run).
     */
    commandsMigrated: number

    /**
     * undefined value means that we're still scanning existing prompts to calculate
     * total commands to migrate (scan first to avoid duplications after migration).
     */
    allCommandsToMigrate: number | undefined
}

interface SuccessfulPromptsMigrationStatus {
    type: 'migration_success'
}

interface FailedPromptsMigrationStatus {
    type: 'migration_failed'
    errorMessage: string
}

interface PromptsMigrationSkipStatus {
    type: 'migration_skip'
}

interface NoPromptsMigrationNeeded {
    type: 'no_migration_needed'
}

export interface ClientActionBroadcast {
    type: 'open-recently-prompts'
}
