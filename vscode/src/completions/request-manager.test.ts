import { describe, expect, it } from 'vitest'

import { Completion } from '.'
import { CompletionsCache } from './cache'
import { Provider } from './providers/provider'
import { RequestManager } from './request-manager'

const DOCUMENT_URI = 'file:///path/to/file.ts'
const LOG_ID = 'some-log-id'

class MockProvider extends Provider {
    protected resolve: (completion: Completion[]) => void = () => {}

    public resolveRequest(completions: string[]): void {
        this.resolve(
            completions.map(content => ({
                prefix: this.prefix,
                content,
            }))
        )
    }

    public generateCompletions(): Promise<Completion[]> {
        return new Promise(resolve => {
            this.resolve = resolve
        })
    }
}

function createProvider(prefix: string) {
    return new MockProvider({
        id: LOG_ID,
        prefix,
        suffix: '',
        fileName: '',
        languageId: 'typescript',
        multilineMode: null,
        responsePercentage: 0,
        prefixPercentage: 0,
        suffixPercentage: 0,
        n: 1,
    })
}

describe('RequestManager', () => {
    let requestManager: RequestManager

    beforeEach(() => {
        const cache = new CompletionsCache()
        requestManager = new RequestManager(cache)
    })

    it('resolves a single request', async () => {
        const prefix = 'console.log('
        const provider = createProvider(prefix)

        setTimeout(() => provider.resolveRequest(["'hello')"]), 0)

        await expect(
            requestManager.request(DOCUMENT_URI, LOG_ID, prefix, [provider], [], new AbortController().signal)
        ).resolves.toMatchInlineSnapshot()

        // const provider: Provider = expect(
        //     requestManager.request(DOCUMENT_URI, LOG_ID, prefix, [provider], context, abortSingal)
        // )
    })

    it('keeps requests running when a new request comes in')

    it('serves request from cache when a prior request resolves')
})
