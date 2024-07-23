import {
    type AuthStatus,
    type GraphQLAPIClientConfig,
    contextFiltersProvider,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { localStorage } from '../services/LocalStorageProvider'
import { DEFAULT_VSCODE_SETTINGS, vsCodeMocks } from '../testutils/mocks'
import * as CompletionProvider from './get-completion-provider'
import { getCurrentDocContext } from './get-current-doc-context'
import { TriggerKind } from './get-inline-completions'
import { initCompletionProviderConfig } from './get-inline-completions-tests/helpers'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import * as CompletionLogger from './logger'
import { createProviderConfig } from './providers/anthropic'
import type { FetchCompletionResult } from './providers/fetch-and-process-completions'
import { Provider } from './providers/provider'
import type { RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { sleep } from './utils'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    workspace: {
        ...vsCodeMocks.workspace,

        onDidChangeTextDocument() {
            return null
        },
    },
}))

const DUMMY_CONTEXT: vscode.InlineCompletionContext = {
    selectedCompletionInfo: undefined,
    triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
}

const DUMMY_AUTH_STATUS: AuthStatus = {
    endpoint: 'https://fastsourcegraph.com',
    isDotCom: true,
    isLoggedIn: true,
    isFireworksTracingEnabled: false,
    showInvalidAccessTokenError: false,
    authenticated: true,
    hasVerifiedEmail: true,
    requiresVerifiedEmail: true,
    siteHasCodyEnabled: true,
    siteVersion: '1234',
    primaryEmail: 'heisenberg@exmaple.com',
    username: 'uwu',
    displayName: 'w.w.',
    avatarURL: '',
    userCanUpgrade: false,
    codyApiVersion: 0,
}

graphqlClient.setConfig({} as unknown as GraphQLAPIClientConfig)

class MockRequestProvider extends Provider {
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

function getInlineCompletionProvider(
    args: Partial<ConstructorParameters<typeof InlineCompletionItemProvider>[0]> = {}
): InlineCompletionItemProvider {
    return new InlineCompletionItemProvider({
        completeSuggestWidgetSelection: true,
        statusBar: { addError: () => {}, hasError: () => {}, startLoading: () => {} } as any,
        providerConfig: createProviderConfig({ client: null as any }),
        authStatus: DUMMY_AUTH_STATUS,
        firstCompletionTimeout:
            args?.firstCompletionTimeout ?? DEFAULT_VSCODE_SETTINGS.autocompleteFirstCompletionTimeout,
        ...args,
    })
}

function createNetworkProvider(params: RequestParams): MockRequestProvider {
    const provider = new MockRequestProvider({
        id: 'mock-provider',
        docContext: params.docContext,
        document: params.document,
        position: params.position,
        multiline: false,
        n: 1,
        firstCompletionTimeout: 1500,
        triggerKind: TriggerKind.Automatic,
        completionLogId: 'mock-log-id' as CompletionLogger.CompletionLogID,
    })
    return provider
}

describe('InlineCompletionItemProvider E2E', () => {
    beforeAll(async () => {
        await initCompletionProviderConfig({ autocompleteExperimentalSmartThrottle: true })

        // Dummy noop implementation of localStorage.
        localStorage.setStorage({
            get: () => null,
            update: () => {},
        } as any as vscode.Memento)
    })

    beforeEach(() => {
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
    })

    describe('logger', () => {
        const createCompletion = (provider: InlineCompletionItemProvider, textWithCursor: string) => {
            const { document, position } = documentAndPosition(textWithCursor)
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 1000,
                maxSuffixLength: 1000,
                context: undefined,
            })

            const mockRequestProvider = createNetworkProvider({
                document,
                position,
                docContext,
            } as RequestParams)

            vi.spyOn(CompletionProvider, 'getCompletionProvider').mockReturnValueOnce(
                mockRequestProvider
            )

            const resultPromise = provider.provideInlineCompletionItems(
                document,
                position,
                DUMMY_CONTEXT
            )

            return {
                resultPromise,
                resolve: (completion: string) => mockRequestProvider.yield([completion]),
            }
        }

        it('logs two in-flight completions as shown', async () => {
            const logSpy = vi.spyOn(CompletionLogger, 'suggested')

            const provider = getInlineCompletionProvider()

            const first = documentAndPosition('console.█')
            const firstDocContext = getCurrentDocContext({
                document: first.document,
                position: first.position,
                maxPrefixLength: 1000,
                maxSuffixLength: 1000,
                context: undefined,
            })
            const firstNetworkProvider = createNetworkProvider({
                document: first.document,
                position: first.position,
                docContext: firstDocContext,
                selectedCompletionInfo: undefined,
            })

            const second = documentAndPosition('console.log(█')
            const secondDocContext = getCurrentDocContext({
                document: second.document,
                position: second.position,
                maxPrefixLength: 1000,
                maxSuffixLength: 1000,
                context: undefined,
            })
            const secondNetworkProvider = createNetworkProvider({
                document: second.document,
                position: second.position,
                docContext: secondDocContext,
                selectedCompletionInfo: undefined,
            })

            vi.spyOn(CompletionProvider, 'getCompletionProvider')
                .mockReturnValueOnce(firstNetworkProvider)
                .mockReturnValueOnce(secondNetworkProvider)

            const [result1, result2] = await Promise.all([
                (async () => {
                    const promise = provider.provideInlineCompletionItems(
                        first.document,
                        first.position,
                        DUMMY_CONTEXT
                    )
                    await sleep(100)
                    firstNetworkProvider.yield(["log('hello')"])
                    return promise
                })(),
                (async () => {
                    const promise = provider.provideInlineCompletionItems(
                        second.document,
                        second.position,
                        DUMMY_CONTEXT
                    )
                    await sleep(150)
                    secondNetworkProvider.yield(["'hello')"])
                    return promise
                })(),
            ])

            // Result 1 is marked as stale
            expect(result1).toBeNull()
            // Result 2 is used
            expect(result2).toBeDefined()

            expect(logSpy).toHaveBeenCalledTimes(1)
        })
    })
})
