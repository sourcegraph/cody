import { wrapInActiveSpan } from '../../tracing'

/**
 * A strategy for handling multiple abort signals related to one operation.
 */
abstract class AbortAggregator {
    protected readonly controller: AbortController = new AbortController()
    public readonly signal: AbortSignal = this.controller.signal

    /**
     * Adds `signal` to the aggregated abort.
     */
    abstract enrol(signal: AbortSignal): void

    /**
     * Aborts the aggregated abort.
     */
    abort(): void {
        this.controller.abort()
    }
}

/**
 * Aggregates multiple abort signals into a single abort signal. The aggregate
 * signal is aborted when the last enrolled signal is aborted.
 *
 * Visible for testing.
 */
export class AbortWhenAllEnrolledAbort extends AbortAggregator {
    private readonly waiting: Set<AbortSignal> = new Set()

    enrol(signal: AbortSignal) {
        if (this.waiting.has(signal) || signal.aborted) {
            return
        }
        this.waiting.add(signal)
        const handler = () => {
            signal.removeEventListener('abort', handler)
            this.waiting.delete(signal)
            if (this.waiting.size === 0 && !this.controller.signal.aborted) {
                this.controller.abort()
            }
        }
        signal.addEventListener('abort', handler)
    }
}

/**
 * Ignores enrolled abort signals.
 *
 * Visible for testing.
 */
export class AbortIgnorer extends AbortAggregator {
    enrol(signal: AbortSignal) {
        // Do nothing.
    }
}

/**
 * Caches a GraphQL result of type V. The cache will expire after maxAgeMsec,
 * or can be manually invalidated with invalidate(). Concurrent reads during
 * fetch will be de-duped to a single result. Invalidating the cache while there
 * are readers waiting on a result will abort the fetch.
 *
 * If the fetch results in an error, the cache expires earlier according to an
 * exponential backoff strategy.
 */
export class GraphQLResultCache<V> {
    // Name of the query we're caching to annotate cache hits in spans.
    private readonly queryName: string

    // How long we'll reuse a result from the first time we started fetching it.
    private readonly successMaxAgeMsec: number

    // The number of consecutive times we have got an error.
    private retryCount = 0

    // How long to wait, in msec, before retrying a failed fetch.
    private readonly initialRetryDelayMsec: number

    // How quickly to grow the delay between retries. This is capped at
    // `successMaxAgeMsec`.
    private readonly backoffFactor: number

    // When we started the last fetch.
    private fetchTimeMsec = 0

    // The last fetch we started running. We only want to cache a result from
    // the latest fetch.
    private lastFetch: Promise<V | Error> | undefined

    // Controls aborting the shared fetch if all of the callers have aborted it.
    private aborts: AbortAggregator = new AbortIgnorer()

    // The cached result. We don't want to cache errors, so we need to inspect
    // the result when it is available.
    private lastResult: V | Error | undefined

    constructor({
        queryName,
        maxAgeMsec,
        initialRetryDelayMsec,
        backoffFactor,
    }: { queryName: string; maxAgeMsec: number; initialRetryDelayMsec: number; backoffFactor: number }) {
        this.queryName = queryName
        this.successMaxAgeMsec = maxAgeMsec
        this.initialRetryDelayMsec = initialRetryDelayMsec
        this.backoffFactor = backoffFactor
    }

    /**
     * Invalidates the cache. If there is an in-progress fetch, it is aborted.
     */
    invalidate(): void {
        this.lastFetch = undefined
        this.lastResult = undefined
        this.fetchTimeMsec = 0
        this.aborts.abort()
        this.aborts = new AbortIgnorer()
    }

    private get maxAgeMsec(): number {
        return this.lastResult instanceof Error
            ? Math.min(
                  this.successMaxAgeMsec,
                  this.initialRetryDelayMsec * this.backoffFactor ** (this.retryCount - 1)
              )
            : this.successMaxAgeMsec
    }

    async get(
        signal: AbortSignal | undefined,
        fetcher: (signal: AbortSignal) => Promise<V | Error>
    ): Promise<V | Error> {
        const now = Date.now()
        if (
            // We fetched, or are fetching
            this.lastFetch &&
            // The result, if any, is fresh
            this.fetchTimeMsec + this.maxAgeMsec > now
        ) {
            if (signal) {
                // If the cache is still fetching, we don't want to abort until
                // this request also aborts.
                this.aborts.enrol(signal)
            }
            // Note, we always return lastFetch here. That way we preserve
            // whether an Error result was returned, or thrown, even though we
            // treat all errors the same for exponential backoff.
            return (
                wrapInActiveSpan(`graphql.fetch.${this.queryName}.cached`, () => this.lastFetch) ||
                this.lastFetch
            )
        }
        // We missed the cache, so start a new fetch.

        // We do not abort the existing fetch to avoid starving clients if the
        // fetches take longer than the cache expiration.
        this.aborts = new AbortWhenAllEnrolledAbort()
        if (signal) {
            this.aborts.enrol(signal)
        }

        this.fetchTimeMsec = now

        const thisFetch = fetcher(this.aborts.signal)
        void (async () => {
            try {
                const result = await thisFetch
                if (this.lastFetch === thisFetch) {
                    this.lastResult = result
                    if (this.lastResult instanceof Error) {
                        this.retryCount++
                    } else {
                        this.retryCount = 0
                    }
                    this.aborts = new AbortIgnorer()
                }
            } catch (error) {
                if (this.lastFetch === thisFetch && error instanceof Error) {
                    this.lastResult = error
                    this.retryCount++
                    this.aborts = new AbortIgnorer()
                }
                // We swallow the error here; this Promise chain is just to
                // update the cache's state.
            }
        })()
        this.lastResult = undefined
        this.lastFetch = thisFetch
        return thisFetch
    }
}
