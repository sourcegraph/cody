import { ContextItem } from './SimpleChatModel'

/**
 * Aggregates results from multiple sources. Drops results that have too much overlap
 * with existing results.
 */
export class ResultAggregator {
    private results: ContextItem[] = []
    private resultsByUri = new Map<string, ContextItem[]>()

    public addResults(results: ContextItem[]): void {
        for (const r of results) {
            this.addResult(r)
        }
    }

    // Returns boolean indicating whether result was added (true) or dropped (false).
    public addResult(result: ContextItem): boolean {
        const uriResults = this.resultsByUri.get(result.uri.toString())
        if (!uriResults) {
            this.results.push(result)
            this.resultsByUri.set(result.uri.toString(), [result])
            return true
        }
        const fullFileUriResults = uriResults.filter(r => !r.range)

        if (!result.range) {
            // result is entire file
            this.results = this.results.filter(r => r.uri.toString() !== result.uri.toString()).concat([result])
            this.resultsByUri.set(result.uri.toString(), [result])
            return fullFileUriResults.length === 0
        }

        if (fullFileUriResults.length > 0) {
            // file is already in results
            return false
        }

        for (const uriResult of uriResults) {
            if (!uriResult.range) {
                continue // should never occur, case handled above
            }
            const intersection = result.range.intersection(uriResult.range)
            if (intersection && !intersection.isEmpty) {
                // ranges overlap, drop result
                //
                // note: we could merge here, but that would rely on the range perfectly
                // corresponding to result.text in both cases, which we're unsure of
                return false
            }
        }

        this.results.push(result)
        this.resultsByUri.get(result.uri.toString())?.push(result)
        return true
    }

    public getResults(): ContextItem[] {
        return [...this.results]
    }
}
