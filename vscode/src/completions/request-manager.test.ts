import dedent from 'dedent'
import { beforeEach, describe, expect, it } from 'vitest'

import { nextTick } from '@sourcegraph/cody-shared'

import { getCurrentDocContext } from './get-current-doc-context'
import { InlineCompletionsResultSource, TriggerKind } from './get-inline-completions'
import { initCompletionProviderConfig } from './get-inline-completions-tests/helpers'
import type { CompletionLogID } from './logger'
import type { FetchCompletionResult } from './providers/fetch-and-process-completions'
import { STOP_REASON_HOT_STREAK } from './providers/hot-streak'
import { type GenerateCompletionsOptions, Provider } from './providers/provider'
import {
    RequestManager,
    type RequestManagerResult,
    type RequestParams,
    computeIfRequestStillRelevant,
} from './request-manager'
import { documentAndPosition, prefixAndSuffix } from './test-helpers'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

class MockProvider extends Provider {
    public didFinishNetworkRequest = false
    public didAbort = false
    protected next: () => void = () => {}
    protected responseQueue: FetchCompletionResult[][] = []
    public providerOptions: GenerateCompletionsOptions | null = null

    public yield(completions: string[] | InlineCompletionItemWithAnalytics[], keepAlive = false) {
        const result = completions.map(content =>
            typeof content === 'string'
                ? {
                      completion: { insertText: content, stopReason: 'test' },
                      docContext: this.providerOptions!.docContext,
                  }
                : {
                      completion: content,
                      docContext: this.providerOptions!.docContext,
                  }
        )

        this.responseQueue.push(result)
        this.didFinishNetworkRequest = !keepAlive
        this.next()
    }

    public async *generateCompletions(
        providerOptions: GenerateCompletionsOptions,
        abortSignal: AbortSignal
    ): AsyncGenerator<FetchCompletionResult[]> {
        this.providerOptions = providerOptions

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

function createProvider() {
    return new MockProvider({
        id: 'mock-provider',
        anonymousUserID: 'anonymousUserID',
        legacyModel: 'test-model',
        source: 'local-editor-settings',
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

        createRequest = (prefix: string, provider: Provider, suffix?: string) => {
            const { docContext, document, position } = docState(prefix, suffix)

            return requestManager.request({
                requestParams: docState(prefix, suffix),
                providerOptions: {
                    authStatus: {} as any,
                    config: {} as any,
                    docContext,
                    document,
                    position,
                    multiline: false,
                    numberOfCompletionsToGenerate: 1,
                    firstCompletionTimeout: 1500,
                    triggerKind: TriggerKind.Automatic,
                    completionLogId: 'mock-log-id' as CompletionLogID,
                },
                provider,
                context: [],
                isCacheEnabled: true,
                isPreloadRequest: false,
                logId: '1' as CompletionLogID,
            })
        }
        checkCache = (prefix: string, suffix?: string) =>
            requestManager.checkCache({ requestParams: docState(prefix, suffix), isCacheEnabled: true })
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider = createProvider()

        setTimeout(() => provider.yield(["'hello')"]), 0)

        const { completions, source } = await createRequest(prefix, provider)

        expect(completions[0].insertText).toBe("'hello')")
        expect(source).toBe(InlineCompletionsResultSource.Network)
    })

    it('does not resolve from cache if the suffix has changed', async () => {
        const prefix = 'console.log('
        const suffix1 = ')\nconsole.log(1)'
        const provider1 = createProvider()
        setTimeout(() => provider1.yield(["'hello')"]), 0)
        await createRequest(prefix, provider1, suffix1)

        const suffix2 = ')\nconsole.log(2)'
        const provider2 = createProvider()
        setTimeout(() => provider2.yield(["'world')"]), 0)

        const { completions, source } = await createRequest(prefix, provider2, suffix2)

        expect(source).toBe(InlineCompletionsResultSource.Network)
        expect(completions[0].insertText).toBe("'world')")
    })

    it('keeps requests running when a new request comes in', async () => {
        const prefix1 = 'console.'
        const provider1 = createProvider()
        const promise1 = createRequest(prefix1, provider1)

        const prefix2 = 'console.log('
        const provider2 = createProvider()
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
        const provider1 = createProvider()
        const promise1 = createRequest(prefix1, provider1)

        const prefix2 = 'console.log('
        const provider2 = createProvider()
        const promise2 = createRequest(prefix2, provider2)

        provider1.yield(["log('hello')"])

        const firstResult = await promise1
        expect(firstResult.completions[0].insertText).toBe("log('hello')")
        // The first result is not synthesized, so we will maintain the existing logId
        expect(firstResult.updatedLogId).toBeUndefined()

        const secondResult = await promise2
        expect(secondResult.completions[0].insertText).toBe("'hello')")
        expect(secondResult.source).toBe(InlineCompletionsResultSource.CacheAfterRequestStart)
        // The second request is synthesized from the previous result, so we set `updatedLogId` to ensure
        // the logging of the second result matches that of the first.
        expect(secondResult.updatedLogId).not.toBeUndefined()

        expect(provider1.didFinishNetworkRequest).toBe(true)
        expect(provider2.didFinishNetworkRequest).toBe(false)

        // Ensure that the completed network request does not cause issues
        provider2.yield(["'world')"])
    })

    describe('cache', () => {
        it('resolves a single request with a cached value without waiting for the debounce timeout', async () => {
            const prefix = 'console.log('
            const provider1 = createProvider()
            setTimeout(() => provider1.yield(["'hello')"]), 0)
            await createRequest(prefix, provider1)

            const { completions, source, isFuzzyMatch } = checkCache(prefix)!

            expect(isFuzzyMatch).toBe(false)
            expect(source).toBe(InlineCompletionsResultSource.Cache)
            expect(completions[0].insertText).toBe("'hello')")
        })

        it('does not match when the previous line is different and the current line suffix is an empty string', async () => {
            const docState1 = prefixAndSuffix(dedent`
                console.log(1)
                █
                console.log(3)
            `)
            const provider1 = createProvider()
            setTimeout(() => provider1.yield(['console.log(2)']), 0)
            await createRequest(docState1.prefix, provider1, docState1.suffix)

            const cachedResult = checkCache(docState1.prefix, docState1.suffix)!

            expect(cachedResult.isFuzzyMatch).toBe(false)
            expect(cachedResult.source).toBe(InlineCompletionsResultSource.Cache)
            expect(cachedResult.completions[0].insertText).toBe('console.log(2)')

            const docState2 = prefixAndSuffix(dedent`
                somethingElse(1)
                █
                console.log(3)
            `)
            const nullResult = checkCache(docState2.prefix, docState2.suffix)!
            expect(nullResult).toBeNull()
        })

        describe('fuzzy matching with multiple previous lines', () => {
            it('does not match when multiple previous lines are different', async () => {
                const prefix1 = 'function yourHelper() {\n  const x = 1;\n  const y = 2;\n  console.'
                const provider1 = createProvider()
                setTimeout(() => provider1.yield(['log(x + y)']), 0)
                await createRequest(prefix1, provider1)

                const prefix2 =
                    'function myHelperAtHome() {\n  const a = 10;\n  const b = 20;\n  console.'

                expect(checkCache(prefix2)).toBe(null)
            })

            it('fuzzy matches when semicolons are added', async () => {
                const prefix1 = 'function foo() {\n  const x = 1;\n  const y = 2;\n  console.'
                const provider1 = createProvider()
                setTimeout(() => provider1.yield(['log(x + y)']), 0)
                await createRequest(prefix1, provider1)

                const prefix2 = 'function foo() {\n  const x = 1\n  const y = 2\n  console.'
                const { completions, source, isFuzzyMatch } = checkCache(prefix2)!

                expect(source).toBe(InlineCompletionsResultSource.Cache)
                expect(isFuzzyMatch).toBe(true)
                expect(completions[0].insertText).toBe('log(x + y)')
            })

            it('fuzzy matches when previous lines are similar and within the fuzzy match distance', async () => {
                const prefix1 =
                    'function foo() {\n  const x = 1;\n  const y = 2;\n  const z = 3;\n  console.'
                const provider1 = createProvider()
                setTimeout(() => provider1.yield(['log(x + y + z)']), 0)
                await createRequest(prefix1, provider1)

                const prefix2 =
                    'function bar() {\n  const a = 1;\n  const b = 2;\n  const c = 4;\n  console.'
                const { completions, source, isFuzzyMatch } = await checkCache(prefix2)!

                expect(source).toBe(InlineCompletionsResultSource.Cache)
                expect(isFuzzyMatch).toBe(true)
                expect(completions[0].insertText).toBe('log(x + y + z)')
            })

            it('fuzzy matches when new lines are added', async () => {
                const prefix1 = 'function foo() {\n  const x = 1;\n  const y = 2;\n  console.'
                const provider1 = createProvider()
                setTimeout(() => provider1.yield(['log(x + y)']), 0)
                await createRequest(prefix1, provider1)

                const prefix2 = 'function foo() {\n  const x = 1\n\n  const y = 2\n\n\n  console.'
                const { completions, source, isFuzzyMatch } = checkCache(prefix2)!

                expect(source).toBe(InlineCompletionsResultSource.Cache)
                expect(isFuzzyMatch).toBe(true)
                expect(completions[0].insertText).toBe('log(x + y)')
            })
        })
    })

    describe('abort logic', () => {
        it('aborts a newer request if a prior request resolves it', async () => {
            const prefix1 = 'console.'
            const provider1 = createProvider()
            const promise1 = createRequest(prefix1, provider1)

            const prefix2 = 'console.log('
            const provider2 = createProvider()
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
            const provider1 = createProvider()
            createRequest(prefix1, provider1)

            const prefix2 = 'table.'
            const provider2 = createProvider()
            createRequest(prefix2, provider2)

            expect(provider1.didAbort).toBe(true)
        })

        it('aborts hot-streak completions when the generation start to diverge from the document', async () => {
            const prefix1 = 'console.'
            const provider1 = createProvider()
            createRequest(prefix1, provider1)

            const prefix2 = 'console.tabletop'
            const provider2 = createProvider()
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
