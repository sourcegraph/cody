import fetch from 'isomorphic-fetch'
import type { Response as NodeResponse } from 'node-fetch'
import { URI } from 'vscode-uri'

import type { TelemetryEventInput } from '@sourcegraph/telemetry'

import type { ConfigurationWithAccessToken } from '../../configuration'
import { logError } from '../../logger'
import { addTraceparent, wrapInActiveSpan } from '../../tracing'
import { isError } from '../../utils'
import { DOTCOM_URL, isDotCom } from '../environments'

import {
    CONTEXT_SEARCH_QUERY,
    CURRENT_SITE_CODY_CONFIG_FEATURES,
    CURRENT_SITE_CODY_LLM_CONFIGURATION,
    CURRENT_SITE_CODY_LLM_PROVIDER,
    CURRENT_SITE_GRAPHQL_FIELDS_QUERY,
    CURRENT_SITE_HAS_CODY_ENABLED_QUERY,
    CURRENT_SITE_IDENTIFICATION,
    CURRENT_SITE_VERSION_QUERY,
    CURRENT_USER_CODY_PRO_ENABLED_QUERY,
    CURRENT_USER_ID_QUERY,
    CURRENT_USER_INFO_QUERY,
    EVALUATE_FEATURE_FLAG_QUERY,
    GET_FEATURE_FLAGS_QUERY,
    LOG_EVENT_MUTATION,
    LOG_EVENT_MUTATION_DEPRECATED,
    RECORD_TELEMETRY_EVENTS_MUTATION,
    REPOSITORY_ID_QUERY,
    REPOSITORY_IDS_QUERY,
    REPOSITORY_LIST_QUERY,
    SEARCH_ATTRIBUTION_QUERY,
} from './queries'
import { buildGraphQLUrl } from './url'

export type BrowserOrNodeResponse = Response | NodeResponse

export function isNodeResponse(response: BrowserOrNodeResponse): response is NodeResponse {
    return Boolean(response.body && !('getReader' in response.body))
}

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'

interface APIResponse<T> {
    data?: T
    errors?: { message: string; path?: string[] }[]
}

interface SiteVersionResponse {
    site: { productVersion: string } | null
}

interface SiteIdentificationResponse {
    site: { siteID: string; productSubscription: { license: { hashedKey: string } } } | null
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

interface CurrentUserInfoResponse {
    currentUser: {
        id: string
        hasVerifiedEmail: boolean
        displayName?: string
        username: string
        avatarURL: string
        codyProEnabled: boolean
        primaryEmail?: { email: string } | null
    } | null
}
interface CodyConfigFeatures {
    chat: boolean
    autoComplete: boolean
    commands: boolean
    attribution: boolean
}

interface CodyConfigFeaturesResponse {
    site: { codyConfigFeatures: CodyConfigFeatures | null } | null
}

interface CurrentUserCodyProEnabledResponse {
    currentUser: {
        codyProEnabled: boolean
    } | null
}

interface CodyLLMSiteConfigurationResponse {
    site: { codyLLMConfiguration: Omit<CodyLLMSiteConfiguration, 'provider'> | null } | null
}

interface CodyLLMSiteConfigurationProviderResponse {
    site: { codyLLMConfiguration: Pick<CodyLLMSiteConfiguration, 'provider'> | null } | null
}

interface RepoListResponse {
    repositories: {
        nodes: { name: string; id: string }[]
        pageInfo: {
            endCursor: string | null
        }
    }
}

interface RepositoryIdResponse {
    repository: { id: string } | null
}

interface RepositoryIdsResponse {
    repositories: {
        nodes: { name: string, id: string }[]
    }
}

interface SearchAttributionResponse {
    snippetAttribution: {
        limitHit: boolean
        nodes: { repositoryName: string }[]
    }
}

type LogEventResponse = unknown

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
    }[]
}

export interface EmbeddingsSearchResult {
    repoName?: string
    revision?: string
    uri: URI
    startLine: number
    endLine: number
    content: string
}

export interface ContextSearchResult {
    repoName: string
    commit: string
    uri: URI
    path: string
    startLine: number
    endLine: number
    content: string
}

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
}

interface CurrentUserInfo {
    id: string
    hasVerifiedEmail: boolean
    username: string
    displayName?: string
    avatarURL: string
    primaryEmail?: { email: string } | null
}

interface EvaluatedFeatureFlag {
    name: string
    value: boolean
}

interface EvaluatedFeatureFlagsResponse {
    evaluatedFeatureFlags: EvaluatedFeatureFlag[]
}

interface EvaluateFeatureFlagResponse {
    evaluateFeatureFlag: boolean
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

export type GraphQLAPIClientConfig = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken' | 'customHeaders'
> &
    Pick<Partial<ConfigurationWithAccessToken>, 'telemetryLevel'>

export let customUserAgent: string | undefined
export function addCustomUserAgent(headers: Headers): void {
    if (customUserAgent) {
        headers.set('User-Agent', customUserAgent)
    }
}
export function setUserAgent(newUseragent: string): void {
    customUserAgent = newUseragent
}

const QUERY_TO_NAME_REGEXP = /^\s*(?:query|mutation)\s+(\w+)/m

export class SourcegraphGraphQLAPIClient {
    private dotcomUrl = DOTCOM_URL
    public anonymousUserID: string | undefined

    /**
     * Should be set on extension activation via `localStorage.onConfigurationChange(config)`
     * Done to avoid passing the graphql client around as a parameter and instead
     * access it as a singleton via the module import.
     */
    private _config: GraphQLAPIClientConfig | null = null

    private get config(): GraphQLAPIClientConfig {
        if (!this._config) {
            throw new Error('GraphQLAPIClientConfig is not set')
        }

        return this._config
    }

    constructor(config: GraphQLAPIClientConfig | null = null) {
        this._config = config
    }

    public onConfigurationChange(newConfig: GraphQLAPIClientConfig): void {
        this._config = newConfig
    }

    /**
     * If set, anonymousUID is trasmitted as 'X-Sourcegraph-Actor-Anonymous-UID'
     * which is automatically picked up by Sourcegraph backends 5.2+
     */
    public setAnonymousUserID(anonymousUID: string): void {
        this.anonymousUserID = anonymousUID
    }

    public isDotCom(): boolean {
        return isDotCom(this.config.serverEndpoint)
    }

    // Gets the server endpoint for this client.
    public get endpoint(): string {
        return this.config.serverEndpoint
    }

    public async getSiteVersion(): Promise<string | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SiteVersionResponse>>(
            CURRENT_SITE_VERSION_QUERY,
            {}
        ).then(response =>
            extractDataOrError(
                response,
                data => data.site?.productVersion ?? new Error('site version not found')
            )
        )
    }

    public async getSiteIdentification(): Promise<{ siteid: string; hashedLicenseKey: string } | Error> {
        const response = await this.fetchSourcegraphAPI<APIResponse<SiteIdentificationResponse>>(
            CURRENT_SITE_IDENTIFICATION,
            {}
        )
        return extractDataOrError(response, data =>
            data.site?.siteID
                ? data.site?.productSubscription?.license?.hashedKey
                    ? {
                          siteid: data.site?.siteID,
                          hashedLicenseKey: data.site?.productSubscription?.license?.hashedKey,
                      }
                    : new Error('site hashed license key not found')
                : new Error('site ID not found')
        )
    }

    public async getSiteHasIsCodyEnabledField(): Promise<boolean | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SiteGraphqlFieldsResponse>>(
            CURRENT_SITE_GRAPHQL_FIELDS_QUERY,
            {}
        ).then(response =>
            extractDataOrError(
                response,
                data => !!data.__type?.fields?.find(field => field.name === 'isCodyEnabled')
            )
        )
    }

    public async getSiteHasCodyEnabled(): Promise<boolean | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SiteHasCodyEnabledResponse>>(
            CURRENT_SITE_HAS_CODY_ENABLED_QUERY,
            {}
        ).then(response => extractDataOrError(response, data => data.site?.isCodyEnabled ?? false))
    }

    public async getCurrentUserId(): Promise<string | Error> {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserIdResponse>>(
            CURRENT_USER_ID_QUERY,
            {}
        ).then(response =>
            extractDataOrError(response, data =>
                data.currentUser ? data.currentUser.id : new Error('current user not found')
            )
        )
    }

    public async getCurrentUserCodyProEnabled(): Promise<{ codyProEnabled: boolean } | Error> {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserCodyProEnabledResponse>>(
            CURRENT_USER_CODY_PRO_ENABLED_QUERY,
            {}
        ).then(response =>
            extractDataOrError(response, data =>
                data.currentUser ? { ...data.currentUser } : new Error('current user not found')
            )
        )
    }

    public async getCurrentUserInfo(): Promise<CurrentUserInfo | Error> {
        return this.fetchSourcegraphAPI<APIResponse<CurrentUserInfoResponse>>(
            CURRENT_USER_INFO_QUERY,
            {}
        ).then(response =>
            extractDataOrError(response, data =>
                data.currentUser ? { ...data.currentUser } : new Error('current user not found')
            )
        )
    }

    /**
     * Fetches the Site Admin enabled/disable Cody config features for the current instance.
     */
    public async getCodyConfigFeatures(): Promise<CodyConfigFeatures | Error> {
        const response = await this.fetchSourcegraphAPI<APIResponse<CodyConfigFeaturesResponse>>(
            CURRENT_SITE_CODY_CONFIG_FEATURES,
            {}
        )
        return extractDataOrError(
            response,
            data => data.site?.codyConfigFeatures ?? new Error('cody config not found')
        )
    }

    public async getCodyLLMConfiguration(): Promise<undefined | CodyLLMSiteConfiguration | Error> {
        // fetch Cody LLM provider separately for backward compatability
        const [configResponse, providerResponse] = await Promise.all([
            this.fetchSourcegraphAPI<APIResponse<CodyLLMSiteConfigurationResponse>>(
                CURRENT_SITE_CODY_LLM_CONFIGURATION
            ),
            this.fetchSourcegraphAPI<APIResponse<CodyLLMSiteConfigurationProviderResponse>>(
                CURRENT_SITE_CODY_LLM_PROVIDER
            ),
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

        return { ...config, provider }
    }

    /**
     * Gets a subset of the list of repositories from the Sourcegraph instance.
     * @param first the number of repositories to retrieve.
     * @param after the last repository retrieved, if any, to continue enumerating the list.
     * @returns the list of repositories. If `endCursor` is null, this is the end of the list.
     */
    public async getRepoList(first: number, after?: string): Promise<RepoListResponse | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepoListResponse>>(REPOSITORY_LIST_QUERY, {
            first,
            after: after || null,
        }).then(response => extractDataOrError(response, data => data))
    }

    public async getRepoId(repoName: string): Promise<string | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepositoryIdResponse>>(REPOSITORY_ID_QUERY, {
            name: repoName,
        }).then(response =>
            extractDataOrError(response, data => (data.repository ? data.repository.id : null))
        )
    }

    public async getRepoIds(names: string[], first: number): Promise<{name: string, id: string}[] | Error> {
        return this.fetchSourcegraphAPI<APIResponse<RepositoryIdsResponse>>(REPOSITORY_IDS_QUERY, {
            names,
            first,
        }).then(response =>
            extractDataOrError(response, data => data.repositories?.nodes || [])
        )
    }

    public async contextSearch(
        repos: Set<string>,
        query: string
    ): Promise<ContextSearchResult[] | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<ContextSearchResponse>>(CONTEXT_SEARCH_QUERY, {
            repos: [...repos],
            query,
            codeResultsCount: 15,
            textResultsCount: 5,
        }).then(response =>
            extractDataOrError(response, data =>
                (data.getCodyContext || []).map(item => ({
                    commit: item.blob.commit.oid,
                    repoName: item.blob.repository.name,
                    path: item.blob.path,
                    uri: URI.parse(`${item.blob.url.startsWith('/') ? this.endpoint : ''}${item.blob.url}?L${item.startLine}-${item.endLine}`),
                    startLine: item.startLine,
                    endLine: item.endLine,
                    content: item.chunkContent,
                }))
            )
        )
    }

    /**
     * Checks if Cody is enabled on the current Sourcegraph instance.
     * @returns
     * enabled: Whether Cody is enabled.
     * version: The Sourcegraph version.
     *
     * This method first checks the Sourcegraph version using `getSiteVersion()`.
     * If the version is before 5.0.0, Cody is disabled.
     * If the version is 5.0.0 or newer, it checks for the existence of the `isCodyEnabled` field using `getSiteHasIsCodyEnabledField()`.
     * If the field exists, it calls `getSiteHasCodyEnabled()` to check its value.
     * If the field does not exist, Cody is assumed to be enabled for versions between 5.0.0 - 5.1.0.
     */
    public async isCodyEnabled(): Promise<{ enabled: boolean; version: string }> {
        // Check site version.
        const siteVersion = await this.getSiteVersion()
        if (isError(siteVersion)) {
            return { enabled: false, version: 'unknown' }
        }
        const insiderBuild = siteVersion.length > 12 || siteVersion.includes('dev')
        if (insiderBuild) {
            return { enabled: true, version: siteVersion }
        }
        // NOTE: Cody does not work on versions older than 5.0
        const versionBeforeCody = siteVersion < '5.0.0'
        if (versionBeforeCody) {
            return { enabled: false, version: siteVersion }
        }
        // Beta version is betwewen 5.0.0 - 5.1.0 and does not have isCodyEnabled field
        const betaVersion = siteVersion >= '5.0.0' && siteVersion < '5.1.0'
        const hasIsCodyEnabledField = await this.getSiteHasIsCodyEnabledField()
        // The isCodyEnabled field does not exist before version 5.1.0
        if (!betaVersion && !isError(hasIsCodyEnabledField) && hasIsCodyEnabledField) {
            const siteHasCodyEnabled = await this.getSiteHasCodyEnabled()
            return { enabled: !isError(siteHasCodyEnabled) && siteHasCodyEnabled, version: siteVersion }
        }
        return { enabled: insiderBuild || betaVersion, version: siteVersion }
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

    /**
     * logEvent is the legacy event-logging mechanism.
     * @deprecated use an implementation of implementation TelemetryRecorder
     * from '@sourcegraph/telemetry' instead.
     */
    public async logEvent(event: event, mode: LogEventMode): Promise<LogEventResponse | Error> {
        if (process.env.CODY_TESTING === 'true') {
            return this.sendEventLogRequestToTestingAPI(event)
        }
        if (this.config?.telemetryLevel === 'off') {
            return {}
        }
        /**
         * If connected to dotcom, just log events to the instance, as it means
         * the same thing.
         */
        if (this.isDotCom()) {
            return this.sendEventLogRequestToAPI(event)
        }

        switch (mode) {
            /**
             * Only log events to dotcom, not the connected instance. Used when
             * another mechanism delivers event logs the instance (i.e. the
             * new telemetry clients)
             */
            case 'dotcom-only':
                return this.sendEventLogRequestToDotComAPI(event)

            /**
             * Only log events to the connected instance, not dotcom. Used when
             * another mechanism handles reporting to dotcom (i.e. the old
             * client and/or the new telemetry framework, which exports events
             * from all instances: https://sourcegraph.com/docs/dev/background-information/telemetry)
             */
            case 'connected-instance-only':
                return this.sendEventLogRequestToAPI(event)

            case 'all': // continue to default handling
        }

        /**
         * Otherwise, send events to the connected instance AND to dotcom (default)
         */
        const responses = await Promise.all([
            this.sendEventLogRequestToAPI(event),
            this.sendEventLogRequestToDotComAPI(event),
        ])
        if (isError(responses[0]) && isError(responses[1])) {
            return new Error(
                `Errors logging events: ${responses[0].toString()}, ${responses[1].toString()}`
            )
        }
        if (isError(responses[0])) {
            return responses[0]
        }
        if (isError(responses[1])) {
            return responses[1]
        }
        return {}
    }

    private anonymizeTelemetryEventInput(event: TelemetryEventInput): void {
        if (isAgentTesting) {
            event.timestamp = undefined
            event.parameters.interactionID = undefined
            event.parameters.billingMetadata = undefined
            event.parameters.metadata = undefined
            event.parameters.metadata = undefined
            event.parameters.privateMetadata = {}
        }
    }

    private anonymizeEvent(event: event): void {
        if (isAgentTesting) {
            event.publicArgument = undefined
            event.argument = undefined
            event.userCookieID = 'ANONYMOUS_USER_COOKIE_ID'
            event.hashedLicenseKey = undefined
        }
    }

    private async sendEventLogRequestToDotComAPI(event: event): Promise<LogEventResponse | Error> {
        this.anonymizeEvent(event)
        const response = await this.fetchSourcegraphDotcomAPI<APIResponse<LogEventResponse>>(
            LOG_EVENT_MUTATION,
            event
        )
        return extractDataOrError(response, data => data)
    }

    private async sendEventLogRequestToAPI(event: event): Promise<LogEventResponse | Error> {
        this.anonymizeEvent(event)
        const initialResponse = await this.fetchSourcegraphAPI<APIResponse<LogEventResponse>>(
            LOG_EVENT_MUTATION,
            event
        )
        const initialDataOrError = extractDataOrError(initialResponse, data => data)

        if (isError(initialDataOrError)) {
            const secondResponse = await this.fetchSourcegraphAPI<APIResponse<LogEventResponse>>(
                LOG_EVENT_MUTATION_DEPRECATED,
                event
            )
            return extractDataOrError(secondResponse, data => data)
        }

        return initialDataOrError
    }

    private async sendEventLogRequestToTestingAPI(event: event): Promise<LogEventResponse | Error> {
        const initialResponse =
            await this.fetchSourcegraphTestingAPI<APIResponse<LogEventResponse>>(event)
        const initialDataOrError = extractDataOrError(initialResponse, data => data)

        if (isError(initialDataOrError)) {
            const secondResponse =
                await this.fetchSourcegraphTestingAPI<APIResponse<LogEventResponse>>(event)
            return extractDataOrError(secondResponse, data => data)
        }

        return initialDataOrError
    }

    public async searchAttribution(snippet: string): Promise<SearchAttributionResults | Error> {
        return this.fetchSourcegraphAPI<APIResponse<SearchAttributionResponse>>(
            SEARCH_ATTRIBUTION_QUERY,
            {
                snippet,
            }
        ).then(response => extractDataOrError(response, data => data.snippetAttribution))
    }

    public async getEvaluatedFeatureFlags(): Promise<Record<string, boolean> | Error> {
        return this.fetchSourcegraphAPI<APIResponse<EvaluatedFeatureFlagsResponse>>(
            GET_FEATURE_FLAGS_QUERY,
            {}
        ).then(response =>
            extractDataOrError(response, data =>
                data.evaluatedFeatureFlags.reduce((acc: Record<string, boolean>, { name, value }) => {
                    acc[name] = value
                    return acc
                }, {})
            )
        )
    }

    public async evaluateFeatureFlag(flagName: string): Promise<boolean | null | Error> {
        return this.fetchSourcegraphAPI<APIResponse<EvaluateFeatureFlagResponse>>(
            EVALUATE_FEATURE_FLAG_QUERY,
            {
                flagName,
            }
        ).then(response => extractDataOrError(response, data => data.evaluateFeatureFlag))
    }

    private fetchSourcegraphAPI<T>(
        query: string,
        variables: Record<string, any> = {}
    ): Promise<T | Error> {
        const headers = new Headers(this.config.customHeaders as HeadersInit)
        headers.set('Content-Type', 'application/json; charset=utf-8')
        if (this.config.accessToken) {
            headers.set('Authorization', `token ${this.config.accessToken}`)
        } else if (this.anonymousUserID) {
            headers.set('X-Sourcegraph-Actor-Anonymous-UID', this.anonymousUserID)
        }

        addTraceparent(headers)
        addCustomUserAgent(headers)

        const queryName = query.match(QUERY_TO_NAME_REGEXP)?.[1]

        const url = buildGraphQLUrl({ request: query, baseUrl: this.config.serverEndpoint })
        return wrapInActiveSpan(`graphql.fetch${queryName ? `.${queryName}` : ''}`, () =>
            fetch(url, {
                method: 'POST',
                body: JSON.stringify({ query, variables }),
                headers,
            })
                .then(verifyResponseCode)
                //.then(response => response.text())
                //.then(text => {
                //    console.log('fetched:', text)
                //    return JSON.parse(text) as T
                //})
                .then(response => response.json() as T)
                .catch(error => {
                    return new Error(`accessing Sourcegraph GraphQL API: ${error} (${url})`)
                })
        )
    }

    // make an anonymous request to the dotcom API
    private fetchSourcegraphDotcomAPI<T>(
        query: string,
        variables: Record<string, any>
    ): Promise<T | Error> {
        const url = buildGraphQLUrl({ request: query, baseUrl: this.dotcomUrl.href })
        const headers = new Headers()
        addCustomUserAgent(headers)
        addTraceparent(headers)

        const queryName = query.match(QUERY_TO_NAME_REGEXP)?.[1]

        return wrapInActiveSpan(`graphql.dotcom.fetch${queryName ? `.${queryName}` : ''}`, () =>
            fetch(url, {
                method: 'POST',
                body: JSON.stringify({ query, variables }),
                headers,
            })
                .then(verifyResponseCode)
                .then(response => response.json() as T)
                .catch(error => new Error(`error fetching Sourcegraph GraphQL API: ${error} (${url})`))
        )
    }

    // make an anonymous request to the Testing API
    private fetchSourcegraphTestingAPI<T>(body: Record<string, any>): Promise<T | Error> {
        const url = 'http://localhost:49300/.api/testLogging'
        const headers = new Headers({
            'Content-Type': 'application/json',
        })
        addCustomUserAgent(headers)

        return fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })
            .then(verifyResponseCode)
            .then(response => response.json() as T)
            .catch(error => new Error(`error fetching Testing Sourcegraph API: ${error} (${url})`))
    }
}

/**
 * Singleton instance of the graphql client.
 * Should be configured on the extension activation via `graphqlClient.onConfigurationChange(config)`.
 */
export const graphqlClient = new SourcegraphGraphQLAPIClient()

/**
 * ConfigFeaturesSingleton is a class that manages the retrieval
 * and caching of configuration features from GraphQL endpoints.
 */
export class ConfigFeaturesSingleton {
    private static instance: ConfigFeaturesSingleton
    private configFeatures: Promise<CodyConfigFeatures>

    // Constructor is private to prevent creating new instances outside of the class
    private constructor() {
        // Initialize with default values
        this.configFeatures = Promise.resolve({
            chat: true,
            autoComplete: true,
            commands: true,
            attribution: false,
        })
        // Initiate the first fetch and set up a recurring fetch every 30 seconds
        this.refreshConfigFeatures()
        // Fetch config features periodically every 30 seconds only if isDotCom is false
        if (!graphqlClient.isDotCom()) {
            setInterval(() => this.refreshConfigFeatures(), 30000)
        }
    }

    // Static method to get the singleton instance
    public static getInstance(): ConfigFeaturesSingleton {
        if (!ConfigFeaturesSingleton.instance) {
            ConfigFeaturesSingleton.instance = new ConfigFeaturesSingleton()
        }
        return ConfigFeaturesSingleton.instance
    }

    // Refreshes the config features by fetching them from the server and caching the result
    private refreshConfigFeatures(): void {
        const previousConfigFeatures = this.configFeatures
        this.configFeatures = this.fetchConfigFeatures().catch((error: Error) => {
            // Ignore a fetcherror as older SG instances will always face this because their GQL is outdated
            if (!error.message.includes('FetchError')) {
                logError('ConfigFeaturesSingleton', 'refreshConfigFeatures', error.message)
            }
            // In case of an error, return previously fetched value
            return previousConfigFeatures
        })
    }

    public getConfigFeatures(): Promise<CodyConfigFeatures> {
        return this.configFeatures
    }

    // Fetches the config features from the server and handles errors
    private async fetchConfigFeatures(): Promise<CodyConfigFeatures> {
        // Execute the GraphQL query to fetch the configuration features
        const features = await graphqlClient.getCodyConfigFeatures()
        if (features instanceof Error) {
            // If there's an error, throw it to be caught in refreshConfigFeatures
            throw features
        }
        // If the fetch is successful, store the fetched configuration features
        return features
    }
}

async function verifyResponseCode(response: Response): Promise<Response> {
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP status code ${response.status}${body ? `: ${body}` : ''}`)
    }
    return response
}

export type LogEventMode =
    | 'dotcom-only' // only log to dotcom
    | 'connected-instance-only' // only log to the connected instance
    | 'all' // log to both dotcom AND the connected instance
