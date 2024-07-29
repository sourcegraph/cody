export interface Attribution {
    limitHit: boolean
    repositories: RepositoryAttribution[]
}

interface RepositoryAttribution {
    name: string
}

export interface Guardrails {
    searchAttribution(snippet: string): Promise<Attribution | Error>
}

// GuardrailsPost implements Guardrails interface by synchronizing on message
// passing between webview and extension process.
export class GuardrailsPost implements Guardrails {
    private currentRequests: Map<string, AttributionSearchSync> = new Map()
    constructor(private postSnippet: (txt: string) => void) {}

    public searchAttribution(snippet: string): Promise<Attribution> {
        let request = this.currentRequests.get(snippet)
        if (request === undefined) {
            request = new AttributionSearchSync()
            this.currentRequests.set(snippet, request)
            this.postSnippet(snippet)
        }
        return request.promise
    }

    public notifyAttributionSuccess(snippet: string, result: Attribution): void {
        const request = this.currentRequests.get(snippet)
        if (request !== undefined) {
            this.currentRequests.delete(snippet)
            request.resolve(result)
        }
        // Do nothing in case there the message is not for an ongoing request.
    }

    public notifyAttributionFailure(snippet: string, error: Error): void {
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
