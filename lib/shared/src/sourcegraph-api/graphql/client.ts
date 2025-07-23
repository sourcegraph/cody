import type { Response as NodeResponse } from 'node-fetch'
import { URI } from 'vscode-uri'
import { fetch } from '../../fetch'

import type { TelemetryEventInput } from '@sourcegraph/telemetry'

import type { IncomingMessage } from 'node:http'
import escapeRegExp from 'lodash/escapeRegExp'
import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'
import { Observable } from 'observable-fns'
import semver from 'semver'
import { dependentAbortController, onAbort } from '../../common/abortController'
import { type PickResolvedConfiguration, resolvedConfig } from '../../configuration/resolver'
import { logError } from '../../logger'
import { distinctUntilChanged, firstValueFrom } from '../../misc/observable'
import { addTraceparent, wrapInActiveSpan } from '../../tracing'
import { isError } from '../../utils'
import { addCodyClientIdentificationHeaders } from '../client-name-version'
import { NeedsAuthChallengeError, isAbortError, isNeedsAuthChallengeError } from '../errors'
import { addAuthHeaders } from '../utils'
import { type GraphQLResultCache, ObservableInvalidatedGraphQLResultCacheFactory } from './cache'
import {
    BUILTIN_PROMPTS_QUERY,
    CHANGE_PROMPT_VISIBILITY,
    CODE_SEARCH_ENABLED_QUERY,
    CONTEXT_FILTERS_QUERY,
    CONTEXT_SEARCH_EVAL_DEBUG_QUERY,
    CONTEXT_SEARCH_QUERY,
    CONTEXT_SEARCH_QUERY_WITH_RANGES,
    CREATE_PROMPT_MUTATION,
    CURRENT_SITE_CODY_CONFIG_FEATURES,
    CURRENT_SITE_CODY_LLM_CONFIGURATION,
    CURRENT_SITE_CODY_LLM_CONFIGURATION_SMART_CONTEXT,
    CURRENT_SITE_CODY_LLM_PROVIDER,
    CURRENT_SITE_GRAPHQL_FIELDS_QUERY,
    CURRENT_SITE_HAS_CODY_ENABLED_QUERY,
    CURRENT_SITE_VERSION_QUERY,
    CURRENT_USER_ID_QUERY,
    CURRENT_USER_INFO_QUERY,
    CURRENT_USER_ROLE_QUERY,
    DELETE_ACCESS_TOKEN_MUTATION,
    EVALUATE_FEATURE_FLAGS_QUERY,
    EVALUATE_FEATURE_FLAG_QUERY,
    FILE_CONTENTS_QUERY,
    FILE_MATCH_SEARCH_QUERY,
    FUZZY_FILES_QUERY,
    FUZZY_SYMBOLS_QUERY,
    GET_FEATURE_FLAGS_QUERY,
    GET_REMOTE_FILE_QUERY,
    GET_URL_CONTENT_QUERY,
    HIGHLIGHTED_FILE_QUERY,
    LEGACY_CONTEXT_SEARCH_QUERY,
    LEGACY_PROMPTS_QUERY_5_8,
    LEGACY_PROMPTS_QUERY_6_3,
    NLS_SEARCH_QUERY,
    PACKAGE_LIST_QUERY,
    PROMPTS_QUERY,
    PROMPT_TAGS_QUERY,
    PromptsOrderBy,
    RECORD_TELEMETRY_EVENTS_MUTATION,
    REPOSITORY_IDS_QUERY,
    REPOSITORY_ID_QUERY,
    REPOSITORY_LIST_QUERY,
    REPOS_SUGGESTIONS_QUERY,
    REPO_NAME_QUERY,
    SEARCH_ATTRIBUTION_QUERY,
    VIEWER_SETTINGS_QUERY,
} from './queries'
import { buildGraphQLUrl } from './url'

export type BrowserOrNodeResponse = Response | NodeResponse

export function isNodeResponse(response: BrowserOrNodeResponse): response is NodeResponse {
    return Boolean(response.body && !('getReader' in response.body))
}

interface APIResponse<T> {
    data?: T
    errors?: { message: string; path?: string[] }[]
}

interface SiteVersionResponse {
    site: { productVersion: string } | null
}

type FuzzyFindFilesResponse = {
    __typename?: 'Query'
    search: {
        results: {
            results: Array<FuzzyFindFile>
        }
    } | null
}

type FuzzyFindSymbolsResponse = {
    __typename?: 'Query'
    search: {
        results: {
            results: FuzzyFindSymbol[]
        }
    }
}

type FuzzyFindFile = {
    file: {
        path: string
        url: string
        name: string
        byteSize: number
        isDirectory: boolean
    }
    repository: { id: string; name: string }
}

type FuzzyFindSymbol = {
    symbols: {
        name: string
        location: {
            range: {
                start: { line: number }
                end: { line: number }
            }
            resource: {
                path: string
            }
        }
    }[]
    repository: { id: string; name: string }
}

interface RemoteFileContentReponse {
    __typename?: 'Query'
    repository: {
        id: string
        commit: {
            id: string
            oid: string
            blob: {
                content: string
            }
        }
    }
}

interface HighlitedFileResponse {
    __typename?: 'Query'
    repository: {
        __typename?: 'Repository'
        commit: {
            __typename?: 'GitCommit'
            file: {
                __typename?: 'GitBlob'
                isDirectory: boolean
                richHTML: string
                highlight: {
                    __typename?: 'HighlightedFile'
                    aborted: boolean
                    lineRanges: Array<Array<string>>
                }
            } | null
        } | null
    } | null
}

interface GetURLContentResponse {
    __typename?: 'Query'
    urlMentionContext: {
        title: string | null
        content: string
    }
}

interface SiteGraphqlFieldsResponse {
    __type: { fields: { name: string }[] } | null
}

interface SiteHasCodyEnabledResponse {
    site: { isCodyEnabled: boolean } | null
}

interface CurrentUserIdResponse {
    currentUser: { id: string } | null
}

interface CurrentUserRoleResponse {
    currentUser: { id: string; siteAdmin: boolean } | null
}

interface CurrentUserInfoResponse {
    currentUser: {
        id: string
        hasVerifiedEmail: boolean
        displayName?: string
        username: string
        siteAdmin: boolean
        avatarURL: string
        codyProEnabled: boolean
        primaryEmail?: { email: string } | null
        organizations: {
            nodes: { name: string; id: string }[]
        }
    } | null
}

export interface CodyConfigFeatures {
    chat: boolean
    autoComplete: boolean
    commands: boolean
    attribution: boolean
}

interface CodyConfigFeaturesResponse {
    site: { codyConfigFeatures: CodyConfigFeatures | null } | null
}

interface CodyEnterpriseConfigSmartContextResponse {
    site: {
        codyLLMConfiguration: { smartContextWindow: string } | null
    } | null
}

interface CodyLLMSiteConfigurationResponse {
    site: {
        codyLLMConfiguration: Omit<CodyLLMSiteConfiguration, 'provider'> | null
    } | null
}

interface CodyLLMSiteConfigurationProviderResponse {
    site: {
        codyLLMConfiguration: Pick<CodyLLMSiteConfiguration, 'provider'> | null
    } | null
}

interface PackageListResponse {
    packageRepoReferences: {
        nodes: {
            id: string
            name: string
            kind: string
            repository: { id: string; name: string; url: string }
        }[]
        pageInfo: {
            endCursor: string | null
        }
    }
}

export interface RepoListResponse {
    repositories: {
        nodes: { name: string; id: string }[]
        pageInfo: {
            endCursor: string | null
        }
    }
}

export interface SuggestionsRepo {
    id: string
    name: string
    stars: number
    url: string
}

export interface RepoSuggestionsSearchResponse {
    search: {
        results: {
            repositories: Array<SuggestionsRepo>
        }
    } | null
}

interface FileMatchSearchResponse {
    search: {
        results: {
            results: {
                __typename: string
                repository: {
                    id: string
                    name: string
                }
                file: {
                    url: string
                    path: string
                    commit: {
                        oid: string
                    }
                }
            }[]
        }
    }
}

export interface NLSSearchFileMatch {
    __typename: 'FileMatch'
    repository: {
        id: string
        name: string
    }
    file: {
        url: string
        path: string
        commit: {
            oid: string
        }
    }
    chunkMatches?: {
        content: string
        contentStart: Position
        ranges: Range[]
    }[]
    pathMatches?: Range[]
    symbols?: {
        name: string
        location: {
            range: Range
        }
    }[]
}

export type NLSSearchResult = NLSSearchFileMatch | { __typename: 'unknown' }

export interface NLSSearchDynamicFilter {
    value: string
    label: string
    count: number
    kind: NLSSearchDynamicFilterKind | string
}

export type NLSSearchDynamicFilterKind = 'repo' | 'lang' | 'type' | 'file'

export interface NLSSearchResponse {
    search: {
        results: {
            dynamicFilters?: NLSSearchDynamicFilter[]
            results: NLSSearchResult[]
        }
    }
}

interface FileContentsResponse {
    repository: {
        commit: {
            file: {
                path: string
                url: string
                content: string
            } | null
        } | null
    } | null
}

export interface RepositoryIdResponse {
    repository: { id: string } | null
}

interface RepositoryNameResponse {
    repository: { name: string } | null
}

export interface RepositoryIdsResponse {
    repositories: {
        nodes: { name: string; id: string }[]
    }
}

export interface SearchAttributionResponse {
    snippetAttribution: {
        limitHit: boolean
        nodes: { repositoryName: string }[]
    }
}
interface ContextSearchResponse {
    getCodyContext: {
        blob: {
            commit: {
                oid: string
            }
            path: string
            repository: {
                id: string
                name: string
            }
            url: string
        }
        startLine: number
        endLine: number
        chunkContent: string
        matchedRanges: Range[]
    }[]
}

interface ContextSearchEvalDebugResponse {
    getCodyContextAlternatives: {
        contextLists: {
            name: string
            contextItems: {
                blob: {
                    commit: {
                        oid: string
                    }
                    path: string
                    repository: {
                        id: string
                        name: string
                    }
                    url: string
                }
                startLine: number
                endLine: number
                chunkContent: string
                matchedRanges: Range[]
            }[]
        }[]
    }
}

interface Position {
    line: number
    character: number
}

export interface Range {
    start: Position
    end: Position
}

/**
 * Experimental API.
 */
export interface ContextSearchResult {
    repoName: string
    commit: string
    uri: URI
    path: string
    startLine: number
    endLine: number
    content: string
    ranges: Range[]
}

interface ContextSearchEvalDebugResult {
    name: string
    contextList: ContextSearchResult[]
}

/**
 * A prompt that can be shared and reused. See Prompt in the Sourcegraph GraphQL API.
 */
export interface Prompt {
    id: string
    name: string
    nameWithOwner: string
    recommended: boolean
    owner?: {
        namespaceName: string
    }
    description?: string
    draft: boolean
    autoSubmit?: boolean
    builtin?: boolean
    mode?: PromptMode
    definition: {
        text: string
    }
    url: string
    createdBy?: {
        id: string
        username: string
        displayName: string
        avatarURL: string
    }
}

interface PromptInput {
    owner: string
    name: string
    description: string
    definitionText: string
    draft: boolean
    autoSubmit: boolean
    mode: PromptMode
    visibility?: 'PUBLIC' | 'SECRET'
}

export enum PromptMode {
    CHAT = 'CHAT',
    EDIT = 'EDIT',
    INSERT = 'INSERT',
}

export interface PromptTag {
    id: string
    name: string
}

interface ContextFiltersResponse {
    site: {
        codyContextFilters: {
            raw: ContextFilters | null
        } | null
    } | null
}

export interface ContextFilters {
    include?: CodyContextFilterItem[] | null
    exclude?: CodyContextFilterItem[] | null
}

export interface CodyContextFilterItem {
    repoNamePattern: string
    // Not implemented
    filePathPatterns?: string[]
}

/**
 * Default value used on the client in case context filters are not set.
 */
export const INCLUDE_EVERYTHING_CONTEXT_FILTERS = {
    include: [{ repoNamePattern: '.*' }],
    exclude: null,
} satisfies ContextFilters

/**
 * Default value used on the client in case client encounters errors
 * fetching or parsing context filters.
 */
export const EXCLUDE_EVERYTHING_CONTEXT_FILTERS = {
    include: null,
    exclude: [{ repoNamePattern: '.*' }],
} satisfies ContextFilters

interface SearchAttributionResults {
    limitHit: boolean
    nodes: { repositoryName: string }[]
}

export interface CodyLLMSiteConfiguration {
    chatModel?: string
    chatModelMaxTokens?: number
    fastChatModel?: string
    fastChatModelMaxTokens?: number
    completionModel?: string
    completionModelMaxTokens?: number
    provider?: string
    smartContextWindow?: boolean
}

export interface CurrentUserInfo {
    id: string
    hasVerifiedEmail: boolean
    username: string
    displayName?: string
    siteAdmin: boolean
    avatarURL: string
    primaryEmail?: { email: string } | null
    organizations: {
        nodes: { name: string; id: string }[]
    }
}

interface EvaluatedFeatureFlag {
    name: string
    value: boolean
}

interface EvaluatedFeatureFlagsResponse {
    evaluatedFeatureFlags: EvaluatedFeatureFlag[]
}

interface EvaluatedFeatureFlagsResponse {
    evaluateFeatureFlags: EvaluatedFeatureFlag[]
}

interface EvaluateFeatureFlagResponse {
    evaluateFeatureFlag: boolean
}

interface ViewerSettingsResponse {
    viewerSettings: { final: string }
}

interface CodeSearchEnabledResponse {
    codeSearchEnabled: boolean
}

function extractDataOrError<T, R>(response: APIResponse<T> | Error, extract: (data: T) => R): R | Error {
    if (isError(response)) {
        return response
    }
    if (response.errors && response.errors.length > 0) {
        return new Error(response.errors.map(({ message }) => message).join(', '))
    }
    if (!response.data) {
        return new Error('response is missing data')
    }
    return extract(response.data)
}

/**
 * @deprecated Use 'TelemetryEvent' instead.
 */
export interface event {
    event: string
    userCookieID: string
    url: string
    source: string
    argument?: string | unknown
    publicArgument?: string | unknown
    client: string
    connectedSiteID?: string
    hashedLicenseKey?: string
}

export interface FetchHighlightFileParameters {
    repoName: string
    commitID: string
    filePath: string
    disableTimeout: boolean
    ranges: HighlightLineRange[]
}

/** A specific highlighted line range to fetch. */
interface HighlightLineRange {
    /**
     * The last line to fetch (0-indexed, inclusive). Values outside the bounds of the file will
     * automatically be clamped within the valid range.
     */
    endLine: number
    /**
     * The first line to fetch (0-indexed, inclusive). Values outside the bounds of the file will
     * automatically be clamped within the valid range.
     */
    startLine: number
}

export type GraphQLAPIClientConfig = PickResolvedConfiguration<{
    auth: true
    configuration: 'telemetryLevel' | 'customHeaders'
    clientState: 'anonymousUserID'
}>

export interface RefetchIntervalHint {
    initialInterval: number
    backoff: number
}

export const DURABLE_REFETCH_INTERVAL_HINT: RefetchIntervalHint = {
    initialInterval: 60 * 60 * 1000, // 1 hour
    backoff: 1.0,
}

export const TRANSIENT_REFETCH_INTERVAL_HINT: RefetchIntervalHint = {
    initialInterval: 7 * 1000, // 7 seconds
    backoff: 1.5,
}

const QUERY_TO_NAME_REGEXP = /^\s*(?:query|mutation)\s+(\w+)/m

export class SourcegraphGraphQLAPIClient {
    private isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'
    private readonly resultCacheFactory: ObservableInvalidatedGraphQLResultCacheFactory
    private readonly siteVersionCache: GraphQLResultCache<string>

    public static withGlobalConfig(): SourcegraphGraphQLAPIClient {
        return new SourcegraphGraphQLAPIClient(resolvedConfig.pipe(distinctUntilChanged()))
    }

    /**
     * Create a GraphQL client with the given configuration. Only use this for testing and API
     * client usage outside of the normal extension lifecycle where it is not possible or desirable
     * to use the currently active configuration.
     */
    public static withStaticConfig(config: GraphQLAPIClientConfig): SourcegraphGraphQLAPIClient {
        return new SourcegraphGraphQLAPIClient(Observable.of(config))
    }

    private constructor(private readonly config: Observable<GraphQLAPIClientConfig>) {
        this.resultCacheFactory = new ObservableInvalidatedGraphQLResultCacheFactory(
            this.config.pipe(
                distinctUntilChanged((a, b) =>
                    // Omit unnecessary to cache system configuration fields
                    // Client state doesn't have any effect on cache invalidation
                    // See https://linear.app/sourcegraph/issue/SRCH-1456/cody-chat-fails-with-unsupported-model-error
                    isEqual(omit(a, ['clientState']), omit(b, ['clientState']))
                )
            ),
            {
                maxAgeMsec: 1000 * 10, // 10 minutes,
                initialRetryDelayMsec: 10, // Don't cache errors for long
                backoffFactor: 1.5, // Back off exponentially
            }
        )
        this.siteVersionCache = this.resultCacheFactory.create<string>('SiteProductVersion')
    }

    dispose(): void {
        this.resultCacheFactory.dispose()
    }

    public async getSiteVersion(signal?: AbortSignal): Promise<string | Error> {
        return this.siteVersionCache.get(signal, signal =>
            this.fetchSourcegraphAPI<APIResponse<SiteVersionResponse>>(
                CURRENT_SITE_VERSION_QUERY,
                {},
                signal
            ).then(response =>
                extractDataOrError(
                    response,
                    data => data.site?.productVersion ?? new Error('site version not found')
                )
            )
        )
    }

    public async getRemoteFiles(
        repositories: string[],
        query: string
    ): Promise<FuzzyFindFile[] | Error> {
        return this.fetchSourcegraphAPI<APIResponse<FuzzyFindFilesResponse>>(
            FUZZY_FILES_QUERY,
            {
                query: `type:path count:30 ${
                    repositories.length > 0 ? `repo:^(${repositories.map(escapeRegExp).join('|')})$` : ''
                } ${query}`,
            },
            AbortSignal.timeout(15000)
        ).then(response =>
            extractDataOrError(
                response,
                data => data.search?.results.results ?? new Error('no files found')
            )
        )
    }

    public async getRemoteSymbols(
        repositories: string[],
        query: string
    ): Promise<FuzzyFindSymbol[] | Error> {
        return this.fetchSourcegraphAPI<APIResponse<FuzzyFindSymbolsResponse>>(FUZZY_SYMBOLS_QUERY, {
            query: `type:symbol count:30 ${
                repositories.length > 0 ? `repo:^(${repositories.map(escapeRegExp).join('|')})$` : ''
            } ${query}`,
        }).then(response =>
            extractDataOrError(
                response,
                data => data.search?.results.results ?? new Error('no symbols found')
            )
        )
    }

    public async getHighlightedFileChunk(
        parameters: FetchHighlightFileParameters
    ): Promise<string[][] | Error> {
        return this.fetchSourcegraphAPI<APIResponse<HighlitedFileResponse>>(HIGHLIGHTED_FILE_QUERY, {
            ...parameters,
            format: 'HTML_HIGHLIGHT',
        }).then(response =>
            extractDataOrError(response, data => {
                if (!data?.repository?.commit?.file?.highlight) {
                    return []
                }

                const file = data.repository.commit.file

                if (file.isDirectory) {
                    return []
                }

                return file.highlight.lineRanges
            })
        )
    }

    public async getFileContent(
        repository: string,
        filePath: string,
        range?: { startLine?: number; endLine?: number },
        signal?: AbortSignal
    ): Promise<string | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RemoteFileContentReponse>>(
            GET_REMOTE_FILE_QUERY,
            {
                repositoryName: repository,
                filePath,
                startLine: range?.startLine,
                endLine: range?.endLine,
            },
            signal
        ).then(response =>
            extractDataOrError(
                response,
                data => data.repository.commit.blob.content ?? new Error('no file found')
            )
        )
    }

    public async getURLContent(url: string): Promise<{ title: string | null; content: string } | Error> {
        return this.fetchSourcegraphAPI<APIResponse<GetURLContentResponse>>(GET_URL_CONTENT_QUERY, {
            url,
        }).then(response =>
            extractDataOrError(
                response,
                data => data.urlMentionContext ?? new Error('failed to fetch url content')
            )
        )
    }

    public async getSiteHasIsCodyEnabledField(signal?: AbortSignal): Promise<boolean | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SiteGraphqlFieldsResponse>>(
            CURRENT_SITE_GRAPHQL_FIELDS_QUERY,
            {},
            signal
        ).then(response =>
            extractDataOrError(
                response,
                data => !!data.__type?.fields?.find(field => field.name === 'isCodyEnabled')
            )
        )
    }

    public async getSiteHasCodyEnabled(signal?: AbortSignal): Promise<boolean | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SiteHasCodyEnabledResponse>>(
            CURRENT_SITE_HAS_CODY_ENABLED_QUERY,
            {},
            signal
        ).then(response => extractDataOrError(response, data => data.site?.isCodyEnabled ?? false))
    }

    public async getCurrentUserId(signal?: AbortSignal): Promise<string | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserIdResponse>>(
            CURRENT_USER_ID_QUERY,
            {},
            signal
        ).then(response =>
            extractDataOrError(response, data => (data.currentUser ? data.currentUser.id : null))
        )
    }

    public async isCurrentUserSideAdmin(): Promise<
        CurrentUserRoleResponse['currentUser'] | null | Error
    > {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserRoleResponse>>(
            CURRENT_USER_ROLE_QUERY,
            {}
        ).then(response =>
            extractDataOrError(response, data => (data.currentUser ? data.currentUser : null))
        )
    }

    public async getCurrentUserInfo(signal?: AbortSignal): Promise<CurrentUserInfo | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserInfoResponse>>(
            CURRENT_USER_INFO_QUERY,
            {},
            signal
        ).then(response =>
            extractDataOrError(response, data => (data.currentUser ? { ...data.currentUser } : null))
        )
    }

    /**
     * Fetches the Site Admin enabled/disable Cody config features for the current instance.
     */
    public async getCodyConfigFeatures(signal?: AbortSignal): Promise<CodyConfigFeatures | Error> {
        const response = await this.fetchSourcegraphAPI<APIResponse<CodyConfigFeaturesResponse>>(
            CURRENT_SITE_CODY_CONFIG_FEATURES,
            {},
            signal
        )
        return extractDataOrError(
            response,
            data => data.site?.codyConfigFeatures ?? new Error('cody config not found')
        )
    }

    public async getCodyLLMConfiguration(
        signal?: AbortSignal
    ): Promise<undefined | CodyLLMSiteConfiguration | Error> {
        // fetch Cody LLM provider separately for backward compatibility
        const [configResponse, providerResponse, smartContextWindow] = await Promise.all([
            this.fetchSourcegraphAPI<APIResponse<CodyLLMSiteConfigurationResponse>>(
                CURRENT_SITE_CODY_LLM_CONFIGURATION,
                undefined,
                signal
            ),
            this.fetchSourcegraphAPI<APIResponse<CodyLLMSiteConfigurationProviderResponse>>(
                CURRENT_SITE_CODY_LLM_PROVIDER,
                undefined,
                signal
            ),
            this.getCodyLLMConfigurationSmartContext(signal),
        ])

        const config = extractDataOrError(
            configResponse,
            data => data.site?.codyLLMConfiguration || undefined
        )
        if (!config || isError(config)) {
            return config
        }

        let provider: string | undefined
        const llmProvider = extractDataOrError(
            providerResponse,
            data => data.site?.codyLLMConfiguration?.provider
        )
        if (llmProvider && !isError(llmProvider)) {
            provider = llmProvider
        }

        return { ...config, provider, smartContextWindow }
    }

    async getCodyLLMConfigurationSmartContext(signal?: AbortSignal): Promise<boolean> {
        return (
            this.fetchSourcegraphAPI<APIResponse<CodyEnterpriseConfigSmartContextResponse>>(
                CURRENT_SITE_CODY_LLM_CONFIGURATION_SMART_CONTEXT,
                {},
                signal
            )
                .then(response => {
                    const smartContextResponse = extractDataOrError(
                        response,
                        data => data?.site?.codyLLMConfiguration?.smartContextWindow ?? ''
                    )

                    if (isError(smartContextResponse)) {
                        throw new Error(smartContextResponse.message)
                    }

                    return smartContextResponse !== 'disabled'
                })
                // For backward compatibility, return false by default when the query fails.
                .catch(() => false)
        )
    }

    public async getPackageList(
        kind: string,
        name: string,
        first: number,
        after?: string
    ): Promise<PackageListResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<PackageListResponse>>(PACKAGE_LIST_QUERY, {
            kind,
            name,
            first,
            after: after || null,
        }).then(response => extractDataOrError(response, data => data))
    }

    /**
     * Fetches a list of repositories matching the given query.
     * @param {Object} params - The query parameters
     * @param {number} params.first - The number of repositories to return
     * @param {string} [params.after] - Cursor for pagination
     * @param {string} [params.query] - Search query to filter repositories
     * @returns {Promise<RepoListResponse | Error>} List of repositories that match the query
     */
    public async getRepoList({
        first,
        after,
        query,
    }: {
        first: number
        after?: string
        query?: string
    }): Promise<RepoListResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepoListResponse>>(REPOSITORY_LIST_QUERY, {
            first,
            after: after || null,
            query: query || null,
        }).then(response => extractDataOrError(response, data => data))
    }

    public async searchRepoSuggestions(query: string): Promise<RepoSuggestionsSearchResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepoSuggestionsSearchResponse>>(
            REPOS_SUGGESTIONS_QUERY,
            {
                query: `context:global type:repo count:10 repo:${query}`,
            }
        ).then(response => extractDataOrError(response, data => data))
    }

    public async searchFileMatches(query?: string): Promise<FileMatchSearchResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<FileMatchSearchResponse>>(FILE_MATCH_SEARCH_QUERY, {
            query,
        }).then(response => extractDataOrError(response, data => data))
    }

    public async getFileContents(
        repoName: string,
        filePath: string,
        rev?: string
    ): Promise<FileContentsResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<FileContentsResponse>>(FILE_CONTENTS_QUERY, {
            repoName,
            filePath,
            rev,
        }).then(response => extractDataOrError(response, data => data))
    }

    public async getRepoId(repoName: string): Promise<string | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepositoryIdResponse>>(REPOSITORY_ID_QUERY, {
            name: repoName,
        }).then(response =>
            extractDataOrError(response, data => (data.repository ? data.repository.id : null))
        )
    }

    public async getRepoIds(
        names: string[],
        first: number,
        signal?: AbortSignal
    ): Promise<{ name: string; id: string }[] | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepositoryIdsResponse>>(
            REPOSITORY_IDS_QUERY,
            {
                names,
                first,
            },
            signal
        ).then(response => extractDataOrError(response, data => data.repositories?.nodes || []))
    }

    public async getRepoName(cloneURL: string, signal?: AbortSignal): Promise<string | null> {
        const response = await this.fetchSourcegraphAPI<APIResponse<RepositoryNameResponse>>(
            REPO_NAME_QUERY,
            {
                cloneURL,
            },
            signal
        )

        const result = extractDataOrError(response, data => data.repository?.name ?? null)
        return isError(result) ? null : result
    }

    /**
     * Checks if the current site version is valid based on the given criteria.
     *
     * @param options - The options for version validation.
     * @param options.minimumVersion - The minimum version required.
     * @param options.insider - Whether to consider insider builds as valid. Defaults to true.
     * @returns A promise that resolves to a boolean indicating if the version is valid.
     */
    public async isValidSiteVersion(
        { minimumVersion, insider = true }: { minimumVersion: string; insider?: boolean },
        signal?: AbortSignal
    ): Promise<boolean> {
        const version = await this.getSiteVersion(signal)
        if (isError(version)) {
            return false
        }
        signal?.throwIfAborted()

        const isInsiderBuild = version.length > 12 || version.includes('dev')

        if (isInsiderBuild) {
            return insider
        }

        return semver.gte(version, minimumVersion)
    }

    public async contextSearch({
        repoIDs,
        query,
        signal,
        filePatterns,
    }: {
        repoIDs: string[]
        query: string
        signal?: AbortSignal
        filePatterns?: string[]
    }): Promise<ContextSearchResult[] | null | Error> {
        const hasContextMatchingSupport = await this.isValidSiteVersion({
            minimumVersion: '5.8.0',
        })
        const hasFilePathSupport =
            hasContextMatchingSupport || (await this.isValidSiteVersion({ minimumVersion: '5.7.0' }))
        const config = await firstValueFrom(this.config!)
        signal?.throwIfAborted()

        return this.fetchSourcegraphAPI<APIResponse<ContextSearchResponse>>(
            hasContextMatchingSupport
                ? CONTEXT_SEARCH_QUERY_WITH_RANGES
                : hasFilePathSupport
                  ? CONTEXT_SEARCH_QUERY
                  : LEGACY_CONTEXT_SEARCH_QUERY,
            {
                repos: repoIDs,
                query,
                codeResultsCount: 15,
                textResultsCount: 5,
                ...(hasFilePathSupport ? { filePatterns } : {}),
            },
            signal
        ).then(response =>
            extractDataOrError(response, data =>
                (data.getCodyContext || []).map(item => ({
                    commit: item.blob.commit.oid,
                    repoName: item.blob.repository.name,
                    path: item.blob.path,
                    uri: URI.parse(
                        `${config.auth.serverEndpoint}${item.blob.repository.name}/-/blob/${
                            item.blob.path
                        }?L${item.startLine + 1}-${item.endLine}`
                    ),
                    startLine: item.startLine,
                    endLine: item.endLine,
                    content: item.chunkContent,
                    ranges: item.matchedRanges ?? [],
                }))
            )
        )
    }

    public async contextSearchEvalDebug({
        repoIDs,
        query,
        signal,
        filePatterns,
        codeResultsCount,
        textResultsCount,
    }: {
        repoIDs: string[]
        query: string
        signal?: AbortSignal
        filePatterns?: string[]
        codeResultsCount: number
        textResultsCount: number
    }): Promise<ContextSearchEvalDebugResult[] | null | Error> {
        const config = await firstValueFrom(this.config!)
        signal?.throwIfAborted()

        return this.fetchSourcegraphAPI<APIResponse<ContextSearchEvalDebugResponse>>(
            CONTEXT_SEARCH_EVAL_DEBUG_QUERY,
            {
                repos: repoIDs,
                query,
                codeResultsCount: codeResultsCount,
                textResultsCount: textResultsCount,
                ...filePatterns,
            },
            signal
        ).then(response =>
            extractDataOrError(response, data =>
                (data.getCodyContextAlternatives.contextLists || []).map(contextList => ({
                    name: contextList.name,
                    contextList: contextList.contextItems.map(item => ({
                        commit: item.blob.commit.oid,
                        repoName: item.blob.repository.name,
                        path: item.blob.path,
                        uri: URI.parse(
                            `${config.auth.serverEndpoint}${item.blob.repository.name}/-/blob/${
                                item.blob.path
                            }?L${item.startLine + 1}-${item.endLine}`
                        ),
                        startLine: item.startLine,
                        endLine: item.endLine,
                        content: item.chunkContent,
                        ranges: item.matchedRanges ?? [],
                    })),
                }))
            )
        )
    }

    public async contextFilters(): Promise<{
        filters: ContextFilters | Error
        refetchIntervalHint: RefetchIntervalHint
    }> {
        // CONTEXT FILTERS are only available on Sourcegraph 5.3.3 and later.
        const minimumVersion = '5.3.3'
        const version = await this.getSiteVersion()
        if (isError(version)) {
            const error = version
            logError(
                'SourcegraphGraphQLAPIClient',
                'contextFilters getSiteVersion failed',
                error.message
            )

            // Exclude everything in case of an unexpected error.
            return {
                filters: error,
                refetchIntervalHint: TRANSIENT_REFETCH_INTERVAL_HINT,
            }
        }
        const insiderBuild = version.length > 12 || version.includes('dev')
        const isValidVersion = insiderBuild || semver.gte(version, minimumVersion)
        if (!isValidVersion) {
            return {
                filters: INCLUDE_EVERYTHING_CONTEXT_FILTERS,
                refetchIntervalHint: DURABLE_REFETCH_INTERVAL_HINT,
            }
        }

        const response =
            await this.fetchSourcegraphAPI<APIResponse<ContextFiltersResponse | null>>(
                CONTEXT_FILTERS_QUERY
            )

        const result = extractDataOrError(response, data => {
            if (data?.site?.codyContextFilters?.raw === null) {
                return {
                    filters: INCLUDE_EVERYTHING_CONTEXT_FILTERS,
                    refetchIntervalHint: DURABLE_REFETCH_INTERVAL_HINT,
                }
            }

            if (data?.site?.codyContextFilters?.raw) {
                return {
                    filters: data.site.codyContextFilters.raw,
                    refetchIntervalHint: DURABLE_REFETCH_INTERVAL_HINT,
                }
            }

            // Exclude everything in case of an unexpected response structure.
            return {
                filters: EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
                refetchIntervalHint: TRANSIENT_REFETCH_INTERVAL_HINT,
            }
        })

        if (result instanceof Error) {
            const error = result
            // Ignore errors caused by outdated Sourcegraph API instances.
            if (hasOutdatedAPIErrorMessages(error)) {
                return {
                    filters: INCLUDE_EVERYTHING_CONTEXT_FILTERS,
                    refetchIntervalHint: DURABLE_REFETCH_INTERVAL_HINT,
                }
            }

            if (isNeedsAuthChallengeError(error)) {
                return {
                    filters: error,
                    refetchIntervalHint: {
                        initialInterval: 3 * 1000, // 3 seconds
                        backoff: 1,
                    },
                }
            }

            logError('SourcegraphGraphQLAPIClient', 'contextFilters', error.message)
            // Exclude everything in case of an unexpected error.
            return {
                filters: error,
                refetchIntervalHint: TRANSIENT_REFETCH_INTERVAL_HINT,
            }
        }

        return result
    }

    public async queryPrompts({
        query,
        first,
        recommendedOnly,
        tags,
        signal,
        orderByMultiple,
        owner,
        includeViewerDrafts,
        builtinOnly,
    }: {
        query?: string
        first: number | undefined
        recommendedOnly?: boolean
        tags?: string[]
        signal?: AbortSignal
        orderByMultiple?: PromptsOrderBy[]
        owner?: string
        includeViewerDrafts?: boolean
        builtinOnly?: boolean
    }): Promise<Prompt[]> {
        const [hasIncludeViewerDraftsArg, hasPromptTagsField, hasOrderByRelevance] = await Promise.all([
            this.isValidSiteVersion({
                minimumVersion: '5.9.0',
            }),
            this.isValidSiteVersion({
                minimumVersion: '5.11.0',
            }),
            this.isValidSiteVersion({
                minimumVersion: '6.4.0',
            }),
        ])

        const gqlQuery = hasOrderByRelevance
            ? PROMPTS_QUERY
            : hasIncludeViewerDraftsArg
              ? LEGACY_PROMPTS_QUERY_6_3
              : LEGACY_PROMPTS_QUERY_5_8

        const input = {
            query,
            first: first ?? 100,
            recommendedOnly: recommendedOnly,
            tags: hasPromptTagsField ? tags : undefined,
            owner,
            includeViewerDrafts: includeViewerDrafts ?? true,
            builtinOnly,
            orderBy: hasOrderByRelevance ? PromptsOrderBy.PROMPT_RELEVANCE : undefined,
            orderByMultiple: hasOrderByRelevance
                ? undefined
                : orderByMultiple || [
                      PromptsOrderBy.PROMPT_RECOMMENDED,
                      PromptsOrderBy.PROMPT_UPDATED_AT,
                  ],
        }

        const response = await this.fetchSourcegraphAPI<APIResponse<{ prompts: { nodes: Prompt[] } }>>(
            gqlQuery,
            input,
            signal
        )
        const result = extractDataOrError(response, data => data.prompts.nodes)
        if (result instanceof Error) {
            throw result
        }
        return result
    }

    public async nlsSearchQuery({
        query,
        signal,
    }: {
        query: string
        signal?: AbortSignal
    }): Promise<NLSSearchResponse['search']> {
        const response = await this.fetchSourcegraphAPI<APIResponse<NLSSearchResponse>>(
            NLS_SEARCH_QUERY,
            { query },
            signal
        )

        const result = extractDataOrError(response, data => data.search)
        if (result instanceof Error) {
            throw result
        }
        return result
    }

    public async queryBuiltinPrompts({
        query,
        first,
        signal,
    }: {
        query: string
        first?: number
        signal?: AbortSignal
    }): Promise<Prompt[]> {
        const response = await this.fetchSourcegraphAPI<APIResponse<{ prompts: { nodes: Prompt[] } }>>(
            BUILTIN_PROMPTS_QUERY,
            {
                query,
                first: first ?? 100,
                orderByMultiple: [PromptsOrderBy.PROMPT_UPDATED_AT],
            },
            signal
        )
        const result = extractDataOrError(response, data => data.prompts.nodes)
        if (result instanceof Error) {
            throw result
        }
        return result
    }

    public async createPrompt(input: PromptInput): Promise<{ id: string }> {
        const response = await this.fetchSourcegraphAPI<APIResponse<{ createPrompt: { id: string } }>>(
            CREATE_PROMPT_MUTATION,
            { input }
        )

        const result = extractDataOrError(response, data => data.createPrompt)

        if (result instanceof Error) {
            throw result
        }

        return result
    }

    public async transferPromptOwnership(input: {
        id: string
        visibility: 'PUBLIC' | 'SECRET'
    }): Promise<void> {
        const response = await this.fetchSourcegraphAPI<APIResponse<unknown>>(CHANGE_PROMPT_VISIBILITY, {
            id: input.id,
            newVisibility: input.visibility,
        })

        const result = extractDataOrError(response, data => data)

        if (result instanceof Error) {
            throw result
        }

        return
    }

    public async queryPromptTags({
        signal,
    }: {
        signal?: AbortSignal
    }): Promise<PromptTag[]> {
        const hasPromptTags = await this.isValidSiteVersion({
            minimumVersion: '5.11.0',
            insider: true,
        })
        if (!hasPromptTags) {
            return []
        }

        const response = await this.fetchSourcegraphAPI<
            APIResponse<{ promptTags: { nodes: PromptTag[] } }>
        >(PROMPT_TAGS_QUERY, signal)
        const result = extractDataOrError(response, data => data.promptTags.nodes)
        if (result instanceof Error) {
            throw result
        }
        return result
    }

    /**
     * recordTelemetryEvents uses the new Telemetry API to record events that
     * gets exported: https://sourcegraph.com/docs/dev/background-information/telemetry
     *
     * Only available on Sourcegraph 5.2.0 and later.
     *
     * DO NOT USE THIS DIRECTLY - use an implementation of implementation
     * TelemetryRecorder from '@sourcegraph/telemetry' instead.
     */
    public async recordTelemetryEvents(events: TelemetryEventInput[]): Promise<unknown | Error> {
        for (const event of events) {
            this.anonymizeTelemetryEventInput(event)
        }
        const initialResponse = await this.fetchSourcegraphAPI<APIResponse<unknown>>(
            RECORD_TELEMETRY_EVENTS_MUTATION,
            {
                events,
            }
        )
        return extractDataOrError(initialResponse, data => data)
    }

    // Deletes an access token, if it exists on the server
    public async DeleteAccessToken(token: string): Promise<unknown | Error> {
        const initialResponse = await this.fetchSourcegraphAPI<APIResponse<unknown>>(
            DELETE_ACCESS_TOKEN_MUTATION,
            {
                token,
            }
        )
        return extractDataOrError(initialResponse, data => data)
    }

    private anonymizeTelemetryEventInput(event: TelemetryEventInput): void {
        if (this.isAgentTesting) {
            event.timestamp = undefined
            event.parameters.interactionID = undefined
            event.parameters.billingMetadata = undefined
            event.parameters.metadata = undefined
            event.parameters.metadata = undefined
            event.parameters.privateMetadata = {}
        }
    }

    public async searchAttribution(
        snippet: string,
        signal?: AbortSignal
    ): Promise<SearchAttributionResults | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SearchAttributionResponse>>(
            SEARCH_ATTRIBUTION_QUERY,
            {
                snippet,
            },
            signal
        ).then(response => extractDataOrError(response, data => data.snippetAttribution))
    }

    /**
     *
     * https://github.com/sourcegraph/sourcegraph/pull/3513 introduced a new GraphQL query evaluateFeatureFlags
     * @param flagNames allows multiple flags to be evaluated.
     *
     * Deprecated API: evaluatedFeatureFlags
     */
    public async getEvaluatedFeatureFlags(
        flagNames: string[],
        signal?: AbortSignal
    ): Promise<Record<string, boolean> | Error> {
        const [hasEvaluateFeatureFlags] = await Promise.all([
            this.isValidSiteVersion({ minimumVersion: '6.2.1106' }),
        ])
        // sg version 6.2 and above
        if (hasEvaluateFeatureFlags) {
            const names = flagNames.filter(name => name !== 'test-flag-do-not-use')
            return this.fetchSourcegraphAPI<APIResponse<EvaluatedFeatureFlagsResponse>>(
                EVALUATE_FEATURE_FLAGS_QUERY,
                {
                    flagNames: names,
                },
                signal
            ).then(response => {
                return extractDataOrError(
                    response,
                    data =>
                        data.evaluateFeatureFlags?.reduce(
                            (acc: Record<string, boolean>, { name, value }) => {
                                acc[name] = value
                                return acc
                            },
                            {}
                        ) || {}
                )
            })
        }
        // sg version before 6.2
        return this.fetchSourcegraphAPI<APIResponse<EvaluatedFeatureFlagsResponse>>(
            GET_FEATURE_FLAGS_QUERY,
            {},
            signal
        ).then(response => {
            return extractDataOrError(
                response,
                data =>
                    data.evaluatedFeatureFlags?.reduce(
                        (acc: Record<string, boolean>, { name, value }) => {
                            acc[name] = value
                            return acc
                        },
                        {}
                    ) || {}
            )
        })
    }

    public async evaluateFeatureFlag(
        flagName: string,
        signal?: AbortSignal
    ): Promise<boolean | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<EvaluateFeatureFlagResponse>>(
            EVALUATE_FEATURE_FLAG_QUERY,
            {
                flagName,
            },
            signal
        ).then(response => extractDataOrError(response, data => data.evaluateFeatureFlag))
    }

    public async viewerSettings(signal?: AbortSignal): Promise<Record<string, any> | Error> {
        const response = await this.fetchSourcegraphAPI<APIResponse<ViewerSettingsResponse>>(
            VIEWER_SETTINGS_QUERY,
            {},
            signal
        )
        return extractDataOrError(response, data => JSON.parse(data.viewerSettings.final))
    }

    public async codeSearchEnabled(signal?: AbortSignal): Promise<boolean | Error> {
        const response = await this.fetchSourcegraphAPI<APIResponse<CodeSearchEnabledResponse>>(
            CODE_SEARCH_ENABLED_QUERY,
            {},
            signal
        )
        return extractDataOrError(response, data => data.codeSearchEnabled)
    }

    public async fetchSourcegraphAPI<T>(
        query: string,
        variables: Record<string, any> = {},
        signal?: AbortSignal
    ): Promise<T | Error> {
        if (!this.config) {
            throw new Error('SourcegraphGraphQLAPIClient config not set')
        }
        const config = await firstValueFrom(this.config)
        signal?.throwIfAborted()

        const headers = new Headers(config.configuration?.customHeaders as HeadersInit | undefined)

        if (config.clientState.anonymousUserID && !process.env.CODY_WEB_DONT_SET_SOME_HEADERS) {
            headers.set('X-Sourcegraph-Actor-Anonymous-UID', config.clientState.anonymousUserID)
        }

        const url = new URL(
            buildGraphQLUrl({
                request: query,
                baseUrl: config.auth.serverEndpoint,
            })
        )

        addTraceparent(headers)
        addCodyClientIdentificationHeaders(headers)
        setJSONAcceptContentTypeHeaders(headers)

        try {
            await addAuthHeaders(config.auth, headers, url)
        } catch (error: any) {
            return error
        }

        const queryName = query.match(QUERY_TO_NAME_REGEXP)?.[1]

        const { abortController, timeoutSignal } = dependentAbortControllerWithTimeout(signal)
        return wrapInActiveSpan(`graphql.fetch${queryName ? `.${queryName}` : ''}`, () =>
            fetch(url, {
                method: 'POST',
                body: JSON.stringify({ query, variables }),
                headers,
                signal: abortController.signal,
            })
                .then(verifyResponseCode)
                .then(response => response.json() as T)
                .catch(catchHTTPError(url.href, timeoutSignal))
        )
    }

    // Performs an authenticated request to our non-GraphQL HTTP / REST API.
    public async fetchHTTP<T>(
        queryName: string,
        method: string,
        urlPath: string,
        body?: string,
        signal?: AbortSignal,
        configOverride?: GraphQLAPIClientConfig
    ): Promise<T | Error> {
        const config =
            configOverride ??
            (await (async () => {
                if (!this.config) {
                    throw new Error('SourcegraphGraphQLAPIClient config not set')
                }
                const resolvedConfig = await firstValueFrom(this.config)
                signal?.throwIfAborted()
                return resolvedConfig
            })())

        const headers = new Headers(config.configuration?.customHeaders as HeadersInit | undefined)
        if (config.clientState.anonymousUserID && !process.env.CODY_WEB_DONT_SET_SOME_HEADERS) {
            headers.set('X-Sourcegraph-Actor-Anonymous-UID', config.clientState.anonymousUserID)
        }

        const url = new URL(urlPath, config.auth.serverEndpoint)

        addTraceparent(headers)
        addCodyClientIdentificationHeaders(headers)
        setJSONAcceptContentTypeHeaders(headers)

        try {
            await addAuthHeaders(config.auth, headers, url)
        } catch (error: any) {
            return error
        }

        const { abortController, timeoutSignal } = dependentAbortControllerWithTimeout(signal)
        return wrapInActiveSpan(`httpapi.fetch${queryName ? `.${queryName}` : ''}`, () =>
            fetch(url, {
                method: method,
                body: body,
                headers,
                signal: abortController.signal,
            })
                .then(verifyResponseCode)
                .then(response => response.json() as T)
                .catch(catchHTTPError(url.href, timeoutSignal))
        )
    }
}

export function setJSONAcceptContentTypeHeaders(headers: Headers): void {
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json; charset=utf-8')
}

const DEFAULT_TIMEOUT_MSEC = 20000

/**
 * Create an {@link AbortController} that aborts when the {@link signal} aborts or when the timeout
 * elapses.
 */
function dependentAbortControllerWithTimeout(signal?: AbortSignal): {
    abortController: AbortController
    timeoutSignal: Pick<AbortSignal, 'aborted'>
} {
    const abortController = dependentAbortController(signal)

    const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MSEC)
    onAbort(timeoutSignal, () =>
        abortController.abort({
            message: `timed out after ${DEFAULT_TIMEOUT_MSEC}ms`,
        })
    )
    return { abortController, timeoutSignal }
}

function catchHTTPError(
    url: string,
    timeoutSignal: Pick<AbortSignal, 'aborted'>
): (error: any) => Error {
    return (error: any) => {
        if (isNeedsAuthChallengeError(error)) {
            return error
        }

        // Throw the plain AbortError for intentional aborts so we handle them with call
        // flow, but treat timeout aborts as a network error (below) and include the
        // URL.
        if (isAbortError(error)) {
            if (!timeoutSignal.aborted) {
                throw error
            }
            error = `ETIMEDOUT: timed out after ${DEFAULT_TIMEOUT_MSEC}ms`
        }
        const code = `${(typeof error === 'object' && error ? (error as any).code : undefined) ?? ''} `
        return new Error(`accessing Sourcegraph HTTP API: ${code}${error} (${url})`)
    }
}

/**
 * Singleton instance of the graphql client.
 */
export const graphqlClient = SourcegraphGraphQLAPIClient.withGlobalConfig()

export async function verifyResponseCode(
    response: BrowserOrNodeResponse
): Promise<BrowserOrNodeResponse> {
    if (isCustomAuthChallengeResponse(response)) {
        throw new NeedsAuthChallengeError()
    }

    if (!response.ok) {
        let body: string | undefined
        try {
            body = await response.text()
        } catch {}
        throw new Error(`HTTP status code ${response.status}${body ? `: ${body}` : ''}`)
    }
    return response
}

/**
 * Some customers use an HTTP proxy in front of Sourcegraph that, when the user needs to complete an
 * auth challenge, returns HTTP 401 with a `X-${CUSTOMER}-U2f-Challenge: true` header. Detect these
 * kinds of error responses.
 */
export function isCustomAuthChallengeResponse(
    response:
        | Pick<BrowserOrNodeResponse, 'status' | 'headers'>
        | Pick<IncomingMessage, 'httpVersion' | 'statusCode' | 'headers'>
): boolean {
    function isIncomingMessageType(
        v: typeof response
    ): v is Pick<IncomingMessage, 'httpVersion' | 'statusCode' | 'headers'> {
        return 'httpVersion' in response
    }
    const statusCode = isIncomingMessageType(response) ? response.statusCode : response.status
    if (statusCode === 401) {
        const headerEntries = isIncomingMessageType(response)
            ? Object.entries(response.headers)
            : Array.from(response.headers.entries())
        return headerEntries.some(
            ([name, value]) => /^x-.*-u2f-challenge$/i.test(name) && value === 'true'
        )
    }

    return false
}

function hasOutdatedAPIErrorMessages(error: Error): boolean {
    // Sourcegraph 5.2.3 returns an empty string ("") instead of an error message
    // when querying non-existent codyContextFilters; this produces
    // 'Unexpected end of JSON input'
    return (
        error.message.includes('Cannot query field') ||
        error.message.includes('Unexpected end of JSON input')
    )
}
