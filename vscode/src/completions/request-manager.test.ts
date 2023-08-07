import { beforeEach, describe, expect, it } from 'vitest'

import { Provider } from './providers/provider'
import { RequestManager, RequestManagerResult, RequestParams } from './request-manager'
import { documentAndPosition } from './testHelpers'
import { Completion } from './types'

class MockProvider extends Provider {
    public didFinishNetworkRequest = false
    protected resolve: (completion: Completion[]) => void = () => {}

    public resolveRequest(completions: string[]): void {
        this.didFinishNetworkRequest = true
        this.resolve(completions.map(content => ({ content })))
    }

    public generateCompletions(): Promise<Completion[]> {
        return new Promise(resolve => {
            this.resolve = resolve
        })
    }
}

function createProvider(prefix: string) {
    return new MockProvider({
        id: 'mock-provider',
        prefix,
        suffix: '',
        fileName: '',
        languageId: 'typescript',
        multiline: false,
        responsePercentage: 0,
        prefixPercentage: 0,
        suffixPercentage: 0,
        n: 1,
    })
}

function docState(prefix: string): RequestParams {
    const suffix = ';'
    const { document, position } = documentAndPosition(`${prefix}█${suffix}`)
    return {
        document,
        position,
        docContext: {
            prefix,
            suffix,
            currentLinePrefix:
                prefix.lastIndexOf('\n') === -1 ? prefix : prefix.slice(Math.max(0, prefix.lastIndexOf('\n') + 1)),
            currentLineSuffix: suffix,
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
        },
        multiline: false,
    }
}

describe('RequestManager', () => {
    let createRequest: (prefix: string, provider: Provider) => Promise<RequestManagerResult>
    beforeEach(() => {
        const requestManager = new RequestManager()

        createRequest = (prefix: string, provider: Provider) => requestManager.request(docState(prefix), [provider], [])
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider = createProvider(prefix)

        setTimeout(() => provider.resolveRequest(["'hello')"]), 0)

        const { completions, cacheHit } = await createRequest(prefix, provider)

        expect(completions[0].insertText).toBe("'hello')")
        expect(cacheHit).toBeNull()
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider1 = createProvider(prefix)
        setTimeout(() => provider1.resolveRequest(["'hello')"]), 0)
        await createRequest(prefix, provider1)

        const provider2 = createProvider(prefix)

        const { completions, cacheHit } = await createRequest(prefix, provider2)

        expect(cacheHit).toBe('hit')
        expect(completions[0].insertText).toBe("'hello')")
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
        const { completions, cacheHit } = await promise2
        expect(completions[0].insertText).toBe("'hello')")
        expect(cacheHit).toBe('hit-after-request-started')

        expect(provider1.didFinishNetworkRequest).toBe(true)
        expect(provider2.didFinishNetworkRequest).toBe(false)

        // Ensure that the completed network request does not cause issues
        provider2.resolveRequest(["'world')"])
    })
})
