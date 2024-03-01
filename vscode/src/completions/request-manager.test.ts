import { beforeEach, describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { InlineCompletionsResultSource } from './get-inline-completions'
import { initCompletionProviderConfig } from './get-inline-completions-tests/helpers'
import type { FetchCompletionResult } from './providers/fetch-and-process-completions'
import { STOP_REASON_HOT_STREAK } from './providers/hot-streak'
import { Provider } from './providers/provider'
import {
    RequestManager,
    type RequestManagerResult,
    type RequestParams,
    computeIfRequestStillRelevant,
} from './request-manager'
import { documentAndPosition, nextTick } from './test-helpers'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

class MockProvider extends Provider {
    public didFinishNetworkRequest = false
    public didAbort = false
    protected next: () => void = () => {}
    protected responseQueue: FetchCompletionResult[][] = []

    public yield(completions: string[] | InlineCompletionItemWithAnalytics[], keepAlive = false) {
        const result = completions.map(content =>
            typeof content === 'string'
                ? {
                      completion: { insertText: content, stopReason: 'test' },
                      docContext: this.options.docContext,
                  }
                : {
                      completion: content,
                      docContext: this.options.docContext,
                  }
        )

        this.responseQueue.push(result)
        this.didFinishNetworkRequest = !keepAlive
        this.next()
    }

    public async *generateCompletions(
        abortSignal: AbortSignal
    ): AsyncGenerator<FetchCompletionResult[]> {
        abortSignal.addEventListener('abort', () => {
            this.didAbort = true
        })

        //  generateMockedCompletions(this: MockProvider) {
        while (!(this.didFinishNetworkRequest && this.responseQueue.length === 0)) {
            while (this.responseQueue.length > 0) {
                yield this.responseQueue.shift()!
            }

            // Wait for the next yield
            this.responseQueue = []
            if (!this.didFinishNetworkRequest) {
                await new Promise<void>(resolve => {
                    this.next = resolve
                })
            }
        }
    }
}

function createProvider(prefix: string) {
    const { docContext, document, position } = docState(prefix)

    return new MockProvider({
        id: 'mock-provider',
        docContext,
        document,
        position,
        multiline: false,
        n: 1,
        firstCompletionTimeout: 1500,
    })
}

function docState(prefix: string, suffix = ';', uriString?: string): RequestParams {
    const { document, position } = documentAndPosition(`${prefix}█${suffix}`, undefined, uriString)
    return {
        document,
        position,
        docContext: getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            dynamicMultilineCompletions: false,
        }),
        selectedCompletionInfo: undefined,
    }
}

describe('RequestManager', () => {
    let createRequest: (
        prefix: string,
        provider: Provider,
        suffix?: string
    ) => Promise<RequestManagerResult>
    let checkCache: (prefix: string, suffix?: string) => RequestManagerResult | null
    beforeEach(async () => {
        await initCompletionProviderConfig({})
        const requestManager = new RequestManager()

        createRequest = (prefix: string, provider: Provider, suffix?: string) =>
            requestManager.request({
                requestParams: docState(prefix, suffix),
                provider,
                context: [],
                isCacheEnabled: true,
            })
        checkCache = (prefix: string, suffix?: string) =>
            requestManager.checkCache({ requestParams: docState(prefix, suffix), isCacheEnabled: true })
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider = createProvider(prefix)

        setTimeout(() => provider.yield(["'hello')"]), 0)

        const { completions, source } = await createRequest(prefix, provider)

        expect(completions[0].insertText).toBe("'hello')")
        expect(source).toBe(InlineCompletionsResultSource.Network)
    })

    it('does not resolve from cache if the suffix has changed', async () => {
        const prefix = 'console.log('
        const suffix1 = ')\nconsole.log(1)'
        const provider1 = createProvider(prefix)
        setTimeout(() => provider1.yield(["'hello')"]), 0)
        await createRequest(prefix, provider1, suffix1)

        const suffix2 = ')\nconsole.log(2)'
        const provider2 = createProvider(prefix)
        setTimeout(() => provider2.yield(["'world')"]), 0)

        const { completions, source } = await createRequest(prefix, provider2, suffix2)

        expect(source).toBe(InlineCompletionsResultSource.Network)
        expect(completions[0].insertText).toBe("'world')")
    })

    it('keeps requests running when a new request comes in', async () => {
        const prefix1 = 'console.'
        const provider1 = createProvider(prefix1)
        const promise1 = createRequest(prefix1, provider1)

        const prefix2 = 'console.log('
        const provider2 = createProvider(prefix2)
        const promise2 = createRequest(prefix2, provider2)

        expect(provider1.didFinishNetworkRequest).toBe(false)
        expect(provider2.didFinishNetworkRequest).toBe(false)

        provider2.yield(["'hello')"])

        expect((await promise2).completions[0].insertText).toBe("'hello')")

        // Since the later request resolves first, the first request will not
        // resolve yet.
        expect(provider1.didFinishNetworkRequest).toBe(false)
        expect(provider2.didFinishNetworkRequest).toBe(true)

        provider1.yield(['log();'])
        expect((await promise1).completions[0].insertText).toBe('log();')

        expect(provider1.didFinishNetworkRequest).toBe(true)
    })

    it('synthesizes a result when a prior request resolves', async () => {
        const prefix1 = 'console.'
        const provider1 = createProvider(prefix1)
        const promise1 = createRequest(prefix1, provider1)

        const prefix2 = 'console.log('
        const provider2 = createProvider(prefix2)
        const promise2 = createRequest(prefix2, provider2)

        provider1.yield(["log('hello')"])

        expect((await promise1).completions[0].insertText).toBe("log('hello')")
        const { completions, source } = await promise2
        expect(completions[0].insertText).toBe("'hello')")
        expect(source).toBe(InlineCompletionsResultSource.CacheAfterRequestStart)

        expect(provider1.didFinishNetworkRequest).toBe(true)
        expect(provider2.didFinishNetworkRequest).toBe(false)

        // Ensure that the completed network request does not cause issues
        provider2.yield(["'world')"])
    })

    describe('cache', () => {
        it('resolves a single request with a cached value without waiting for the debounce timeout', async () => {
            const prefix = 'console.log('
            const provider1 = createProvider(prefix)
            setTimeout(() => provider1.yield(["'hello')"]), 0)
            await createRequest(prefix, provider1)

            const { completions, source } = checkCache(prefix)!

            expect(source).toBe(InlineCompletionsResultSource.Cache)
            expect(completions[0].insertText).toBe("'hello')")
        })
    })

    describe('abort logic', () => {
        it('aborts a newer request if a prior request resolves it', async () => {
            const prefix1 = 'console.'
            const provider1 = createProvider(prefix1)
            const promise1 = createRequest(prefix1, provider1)

            const prefix2 = 'console.log('
            const provider2 = createProvider(prefix2)
            const promise2 = createRequest(prefix2, provider2)

            provider1.yield(["log('hello')"])

            expect((await promise1).completions[0].insertText).toBe("log('hello')")
            const [completion] = (await promise2).completions
            expect(completion.insertText).toBe("'hello')")

            // Keeps completion meta-data on cache-hit
            expect(completion).toHaveProperty('stopReason')
            expect(completion).toHaveProperty('range')

            expect(provider2.didAbort).toBe(true)
        })

        it('aborts requests that are no longer relevant', async () => {
            const prefix1 = 'console.'
            const provider1 = createProvider(prefix1)
            createRequest(prefix1, provider1)

            const prefix2 = 'table.'
            const provider2 = createProvider(prefix2)
            createRequest(prefix2, provider2)

            expect(provider1.didAbort).toBe(true)
        })

        it('aborts hot-streak completions when the generation start to diverge from the document', async () => {
            const prefix1 = 'console.'
            const provider1 = createProvider(prefix1)
            createRequest(prefix1, provider1)

            const prefix2 = 'console.tabletop'
            const provider2 = createProvider(prefix2)
            createRequest(prefix2, provider2)

            // we're still looking relevant
            provider1.yield(['ta'], true)
            expect(provider1.didAbort).toBe(false)

            // ok now we diverted (note do don't update the docContext so we have to start the
            // completion at the same prefix as the first request)
            provider1.yield(
                [
                    {
                        insertText: 'tabulatore',
                        stopReason: STOP_REASON_HOT_STREAK,
                    },
                ],
                true
            )
            await nextTick()
            expect(provider1.didAbort).toBe(true)
        })
    })
})

describe('computeIfRequestStillRelevant', () => {
    it('returns true if the latest insertion is a forward type of the latest document', async () => {
        const currentRequest = docState('console.log')
        const previousRequest = docState('console.')
        const completion = { insertText: 'log("Hello, world!")' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('returns true if the latest document is a forward type of the latest insertion document', async () => {
        const currentRequest = docState('console.log("Hello, world!")')
        const previousRequest = docState('console.')
        const completion = { insertText: 'log' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('handles cases on different lines', async () => {
        const currentRequest = docState('if (true) {\n  console.')
        const previousRequest = docState('if (true) {')
        const completion = { insertText: '\n  console.log("wow")' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('handles cases where the prefix is not starting at the same line', async () => {
        let hundredLines = ''
        for (let i = 0; i < 100; i++) {
            hundredLines += `${i}\n`
        }

        const currentRequest = docState(`${hundredLines}if (true) {\n  console.log(`)
        const previousRequest = docState(`${hundredLines}if (true) {`)
        const completion = { insertText: '\n  console.log("wow")\n}' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('never matches for mismatched documents', async () => {
        const currentRequest = docState('console.log', undefined, 'foo.ts')
        const previousRequest = docState('console.', undefined, 'bar.ts')
        const completion = { insertText: 'log("Hello, world!")' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeFalsy()
    })

    it('never matches for mismatching prefixes', async () => {
        const hundredLines = 'WOW\n'.repeat(100)
        const thousandLines = 'WOW\n'.repeat(1000)
        const currentRequest = docState(`${hundredLines}console.log`)
        const previousRequest = docState(`${thousandLines}console.`)
        const completion = { insertText: 'log("Hello, world!")' }

        // Even though the prefix will look the same, it'll be on different lines and should thus
        // not be reused
        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeFalsy()
    })

    it('supports a change in indentation', async () => {
        const currentRequest = docState('    console.log')
        const previousRequest = docState('\tconsole.')
        const completion = { insertText: 'log("Hello, world!")' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('handles typos in the latest document', async () => {
        const currentRequest = docState('console.dir')
        const previousRequest = docState('console.')
        const completion = { insertText: 'log("Hello, world!")' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    it('handles typos in the latest insertion', async () => {
        const currentRequest = docState('console.log')
        const previousRequest = docState('console.')
        const completion = { insertText: 'dir' }

        expect(computeIfRequestStillRelevant(currentRequest, previousRequest, [completion])).toBeTruthy()
    })

    describe('when the request has not yielded a completion yet', () => {
        it('handles cases where the current document is ahead (as the user is typing forward)', async () => {
            const currentRequest = docState('console.log')
            const previousRequest = docState('con')

            expect(computeIfRequestStillRelevant(currentRequest, previousRequest, null)).toBeTruthy()
        })

        it('detects still relevant completions', async () => {
            const currentRequest = docState('console.dir')
            const previousRequest = docState('console.log')

            expect(computeIfRequestStillRelevant(currentRequest, previousRequest, null)).toBeTruthy()
        })

        it('detects irrelevant completions', async () => {
            const currentRequest = docState('console.dir')
            const previousRequest = docState('table.dir')

            expect(computeIfRequestStillRelevant(currentRequest, previousRequest, null)).toBeFalsy()
        })
    })
})
