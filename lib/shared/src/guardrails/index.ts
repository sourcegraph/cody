// Controls whether and how guardrails are enforced, and requests attribution
// for code snippets.
export interface Guardrails {
    searchAttribution(snippet: string): Promise<Attribution | Error>
    shouldHideCodeBeforeAttribution: boolean
    needsAttribution(params: { code: string; language: string | undefined }): boolean
}

// Collects guardrails attribution results. Role interface used by the Webview
// postMessage receiver to pass results to guardrails.
export interface GuardrailsResultSink {
    notifyAttributionSuccess(snippet: string, result: Attribution): void
    notifyAttributionFailure(snippet: string, error: Error): void
}

export interface Attribution {
    limitHit: boolean
    repositories: RepositoryAttribution[]
}

export interface RepositoryAttribution {
    name: string
}

// GuardrailsMode represents the different enforcement modes for guardrails
export enum GuardrailsMode {
    // Off mode: guardrails are disabled
    Off = 'none',
    // Permissive mode: show the code but with an icon indicating the Guardrails check result
    Permissive = 'permissive',
    // Enforced mode: do not display code until guardrails check passes
    Enforced = 'enforced',
}

// GuardrailsCheckStatus represents the status of a guardrails check
export enum GuardrailsCheckStatus {
    // Check hasn't been initiated yet; still generating code
    GeneratingCode = 'generating-code',
    // Check is in progress
    Checking = 'checking',
    // Skipped: Guardrails is disabled or the code is a shell script
    Skipped = 'skipped',
    // Check completed successfully with no matches
    Success = 'success',
    // Check completed but found matches (potential license issues)
    Failed = 'failed',
    // Check failed due to API error
    Error = 'error',
}

// GuardrailsResult represents the result of a guardrails check
export type GuardrailsResult =
    | GuardrailsStatusIndeterminate
    | GuardrailsStatusSuccess
    | GuardrailsStatusFailed
    | GuardrailsStatusError

export interface GuardrailsStatusIndeterminate {
    status: GuardrailsCheckStatus.GeneratingCode | GuardrailsCheckStatus.Checking
}

export interface GuardrailsStatusSuccess {
    status: GuardrailsCheckStatus.Success | GuardrailsCheckStatus.Skipped
}

export interface GuardrailsStatusFailed {
    status: GuardrailsCheckStatus.Failed
    repositories: RepositoryAttribution[]
}

export interface GuardrailsStatusError {
    status: GuardrailsCheckStatus.Error
    error: Error
}

/**
 * Get default guardrails configuration
 */
export function getGuardrailsConfig(): { mode: GuardrailsMode } {
    return { mode: GuardrailsMode.Permissive }
}

/**
 * GuardrailsMetricEvent represents a metric event for guardrails usage
 */
export interface GuardrailsMetricEvent {
    // The type of action that triggered guardrails
    action: 'chat' | 'edit' | 'autocomplete'
    // The status of the guardrails check
    status: GuardrailsCheckStatus
    // The time it took to complete the check (in ms)
    duration: number
    // The guardrails mode being used
    mode: GuardrailsMode
    // Whether code was hidden due to enforced mode
    wasCodeHidden: boolean
    // Whether a respin was requested (if feature is available)
    wasRespinRequested?: boolean
    // Additional info for failed checks
    attributionDetails?: {
        // Number of repositories that matched
        matchCount: number
        // Whether the attribution limit was hit
        limitHit: boolean
    }
}

// Creates an implementation of Guardrails that operates in the specified mode.
export function createGuardrailsImpl(
    mode: 'none' | 'permissive' | 'enforced',
    postSnippet: (snippet: string) => void
): Guardrails & GuardrailsResultSink {
    if (mode === GuardrailsMode.Off) {
        return new GuardrailsDisabled()
    }
    return new GuardrailsPost(mode, postSnippet)
}

// A stub implementation of Guardrails that does nothing. Used when guardrails
// is not enabled, it permits all code to be shown immediately. For convenience
// is a dead-letter box for Guardrails results.
class GuardrailsDisabled implements Guardrails, GuardrailsResultSink {
    shouldHideCodeBeforeAttribution = false

    searchAttribution(snippet: string): Promise<Attribution> {
        return Promise.resolve({ limitHit: false, repositories: [] })
    }

    needsAttribution(_: { code: string; language?: string }): boolean {
        return false
    }

    notifyAttributionSuccess(snippet: string, result: Attribution): void {
        console.warn('Guardrails is disabled but received attribution success result:', snippet, result)
    }

    notifyAttributionFailure(snippet: string, error: Error): void {
        console.warn('Guardrails is disabled but received attribution failure result:', snippet, error)
    }
}

function isShellLanguage(language: string | undefined): boolean {
    return !!(language && ['shell', 'bash', 'sh'].includes(language))
}

// Implementation of Guardrails that posts snippets to the extension (and
// through to the site) for attribution. Can be configured to hide code until
// attribution is complete.
class GuardrailsPost implements Guardrails, GuardrailsResultSink {
    private currentRequests: Map<string, AttributionSearchSync> = new Map()
    constructor(
        private readonly mode: 'permissive' | 'enforced',
        private postSnippet: (txt: string) => void
    ) {}

    get shouldHideCodeBeforeAttribution(): boolean {
        return this.mode === 'enforced'
    }

    needsAttribution({ code, language }: { code: string; language?: string }): boolean {
        // TODO: should this be *non-empty* lines, or include empty lines?
        return code.split('\n').length >= 10 && !isShellLanguage(language)
    }

    searchAttribution(snippet: string): Promise<Attribution> {
        let request = this.currentRequests.get(snippet)
        if (request === undefined) {
            request = new AttributionSearchSync()
            this.currentRequests.set(snippet, request)
            this.postSnippet(snippet)
        }
        return request.promise
    }

    notifyAttributionSuccess(snippet: string, result: Attribution): void {
        const request = this.currentRequests.get(snippet)
        if (request !== undefined) {
            this.currentRequests.delete(snippet)
            request.resolve(result)
        }
        // Do nothing in case there the message is not for an ongoing request.
    }

    notifyAttributionFailure(snippet: string, error: Error): void {
        const request = this.currentRequests.get(snippet)
        if (request !== undefined) {
            this.currentRequests.delete(snippet)
            request.reject(error)
        }
        // Do nothing in case there the message is not for an ongoing request.
    }
}

// AttributionSearchSync provides syncronization for webview / extension messages
// in form of a Promise API for a single search.
class AttributionSearchSync {
    public promise: Promise<Attribution>
    public resolve!: (result: Attribution) => void
    public reject!: (cause: any) => void

    constructor() {
        this.promise = new Promise<Attribution>((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }
}
