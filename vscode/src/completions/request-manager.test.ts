import { beforeEach, describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { InlineCompletionsResultSource } from './get-inline-completions'
import { Provider } from './providers/provider'
import { RequestManager, RequestManagerResult, RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { ContextSnippet } from './types'

class MockProvider extends Provider {
    public didFinishNetworkRequest = false
    public didAbort = false
    protected resolve: (completion: InlineCompletionItemWithAnalytics[]) => void = () => {}

    public resolveRequest(completions: string[]): void {
        this.didFinishNetworkRequest = true
        this.resolve(completions.map(content => ({ insertText: content, stopReason: 'test' })))
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        onCompletionReady: (completions: InlineCompletionItemWithAnalytics[]) => void
    ): Promise<void> {
        abortSignal.addEventListener('abort', () => {
            this.didAbort = true
        })
        return new Promise(resolve => {
            this.resolve = (completions: InlineCompletionItemWithAnalytics[]) => {
                onCompletionReady(completions)
                resolve()
            }
        })
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
    })
}

function docState(prefix: string, suffix: string = ';'): RequestParams {
    const { document, position } = documentAndPosition(`${prefix}█${suffix}`)
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
    let createRequest: (prefix: string, provider: Provider, suffix?: string) => Promise<RequestManagerResult>
    beforeEach(() => {
        const requestManager = new RequestManager()

        createRequest = (prefix: string, provider: Provider, suffix?: string) =>
            requestManager.request({
                requestParams: docState(prefix, suffix),
                providers: [provider],
                context: [],
                isCacheEnabled: true,
            })
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider = createProvider(prefix)

        setTimeout(() => provider.resolveRequest(["'hello')"]), 0)

        const { completions, source } = await createRequest(prefix, provider)

        expect(completions[0].insertText).toBe("'hello')")
        expect(source).toBe(InlineCompletionsResultSource.Network)
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider1 = createProvider(prefix)
        setTimeout(() => provider1.resolveRequest(["'hello')"]), 0)
        await createRequest(prefix, provider1)

        const provider2 = createProvider(prefix)

        const { completions, source } = await createRequest(prefix, provider2)

        expect(source).toBe(InlineCompletionsResultSource.Cache)
        expect(completions[0].insertText).toBe("'hello')")
    })

    it('does not resolve from cache if the suffix has changed', async () => {
        const prefix = 'console.log('
        const suffix1 = ')\nconsole.log(1)'
        const provider1 = createProvider(prefix)
        setTimeout(() => provider1.resolveRequest(["'hello')"]), 0)
        await createRequest(prefix, provider1, suffix1)

        const suffix2 = ')\nconsole.log(2)'
        const provider2 = createProvider(prefix)
        setTimeout(() => provider2.resolveRequest(["'world')"]), 0)

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

        provider2.resolveRequest(["'hello')"])

        expect((await promise2).completions[0].insertText).toBe("'hello')")

        // Since the later request resolves first, the first request will not
        // resolve yet.
        expect(provider1.didFinishNetworkRequest).toBe(false)
        expect(provider2.didFinishNetworkRequest).toBe(true)

        provider1.resolveRequest(['log();'])
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

        provider1.resolveRequest(["log('hello')"])

        expect((await promise1).completions[0].insertText).toBe("log('hello')")
        const { completions, source } = await promise2
        expect(completions[0].insertText).toBe("'hello')")
        expect(source).toBe(InlineCompletionsResultSource.CacheAfterRequestStart)

        expect(provider1.didFinishNetworkRequest).toBe(true)
        expect(provider2.didFinishNetworkRequest).toBe(false)

        // Ensure that the completed network request does not cause issues
        provider2.resolveRequest(["'world')"])
    })

    it('aborts a newer request if a prior request resolves it', async () => {
        const prefix1 = 'console.'
        const provider1 = createProvider(prefix1)
        const promise1 = createRequest(prefix1, provider1)

        const prefix2 = 'console.log('
        const provider2 = createProvider(prefix2)
        const promise2 = createRequest(prefix2, provider2)

        provider1.resolveRequest(["log('hello')"])

        expect((await promise1).completions[0].insertText).toBe("log('hello')")
        const [completion] = (await promise2).completions
        expect(completion.insertText).toBe("'hello')")

        // Keeps completion meta-data on cache-hit
        expect(completion).toHaveProperty('stopReason')
        expect(completion).toHaveProperty('range')

        expect(provider2.didAbort).toBe(true)
    })
})
