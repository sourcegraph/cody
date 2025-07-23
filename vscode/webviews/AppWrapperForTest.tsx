import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthStatus,
    CLIENT_CAPABILITIES_FIXTURE,
    type ClientConfiguration,
    type ContextItem,
    type ContextItemSymbol,
    EMPTY,
    FILE_CONTEXT_MENTION_PROVIDER,
    FIXTURE_MODELS,
    FeatureFlag,
    type ModelsData,
    type ResolvedConfiguration,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type SymbolKind,
    promiseFactoryToObservable,
    serializedPromptEditorStateFromText,
} from '@sourcegraph/cody-shared'
import { ExtensionAPIProviderForTestsOnly } from '@sourcegraph/prompt-editor'
import { Observable } from 'observable-fns'
import { type ComponentProps, type FunctionComponent, type ReactNode, useMemo } from 'react'
import { URI } from 'vscode-uri'
import { COMMON_WRAPPERS } from './AppWrapper'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { FIXTURE_COMMANDS, makePromptsAPIWithData } from './components/promptList/fixtures'
import { FIXTURE_PROMPTS } from './components/promptSelectField/fixtures'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { TelemetryRecorderContext } from './utils/telemetry'
import { ConfigProvider } from './utils/useConfig'

/**
 * For use in tests only.
 */
export const AppWrapperForTest: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    const wrappers = useMemo<Wrapper[]>(
        () => [
            ...COMMON_WRAPPERS,
            {
                provider: TelemetryRecorderContext.Provider,
                value: {
                    recordEvent: () => {},
                },
            } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
            {
                provider: ExtensionAPIProviderForTestsOnly,
                value: {
                    frequentlyUsedContextItems: () => Observable.of([]),
                    mentionMenuData: query =>
                        promiseFactoryToObservable(async () => {
                            await new Promise<void>(resolve => setTimeout(resolve, 250))
                            const queryTextLower = query.text.toLowerCase()
                            return {
                                providers: [
                                    {
                                        title: 'My Context Source',
                                        id: 'my-context-source',
                                        queryLabel: 'Type a query for My Context Source',
                                        emptyLabel: 'No results found from My Context Source',
                                    },
                                ].filter(
                                    p =>
                                        query.provider === null &&
                                        p.title.toLowerCase().includes(queryTextLower)
                                ),
                                items:
                                    query.provider === SYMBOL_CONTEXT_MENTION_PROVIDER.id
                                        ? DUMMY_SYMBOLS.filter(
                                              f =>
                                                  f.symbolName.toLowerCase().includes(queryTextLower) ||
                                                  f.uri.path.includes(queryTextLower)
                                          )
                                        : query.provider === null ||
                                            query.provider === FILE_CONTEXT_MENTION_PROVIDER.id
                                          ? DUMMY_FILES.filter(f => f.uri.path.includes(queryTextLower))
                                          : [
                                                {
                                                    type: 'file',
                                                    uri: URI.file(`sample-${query.provider}-result`),
                                                } satisfies ContextItem,
                                            ].filter(f => f.uri.path.includes(queryTextLower)),
                            }
                        }),
                    evaluatedFeatureFlag: flag => {
                        switch (flag) {
                            case FeatureFlag.CodyExperimentalPromptEditor:
                                // Do not enable the experimental prompt editor in tests (yet).
                                return Observable.of(false)
                            default:
                                return Observable.of(true)
                        }
                    },
                    repos: () => Observable.of([]),
                    prompts: makePromptsAPIWithData({
                        prompts: FIXTURE_PROMPTS,
                        commands: FIXTURE_COMMANDS,
                    }),
                    promptTags: () => Observable.of([]),
                    getCurrentUserId: () => Observable.of(null),
                    highlights: () => Observable.of([]),
                    clientActionBroadcast: () => Observable.of(),
                    models: () =>
                        Observable.of({
                            localModels: [],
                            primaryModels: FIXTURE_MODELS,
                            preferences: { defaults: {}, selected: {} },
                        } satisfies ModelsData),
                    chatModels: () => Observable.of(FIXTURE_MODELS),
                    setChatModel: () => EMPTY,
                    defaultContext: () => Observable.of({ corpusContext: [], initialContext: [] }),
                    hydratePromptMessage: text =>
                        Observable.of(serializedPromptEditorStateFromText(text)),
                    promptsMigrationStatus: () => Observable.of({ type: 'no_migration_needed' }),
                    startPromptsMigration: () => Observable.of(),
                    resolvedConfig: () =>
                        Observable.of({
                            auth: {
                                credentials: { token: 'abc' },
                                serverEndpoint: 'https://example.com',
                            },
                            configuration: {
                                autocomplete: true,
                                devModels: [{ model: 'my-model', provider: 'my-provider' }],
                            } satisfies Partial<ClientConfiguration> as ClientConfiguration,
                        } satisfies Partial<ResolvedConfiguration> as ResolvedConfiguration),
                    authStatus: () => Observable.of(AUTH_STATUS_FIXTURE_AUTHED),
                    transcript: () => Observable.of(FIXTURE_TRANSCRIPT.explainCode),
                    userHistory: () => Observable.of(null),
                    mcpSettings: () => Observable.of(null),
                },
            } satisfies Wrapper<ComponentProps<typeof ExtensionAPIProviderForTestsOnly>['value']>,
            {
                component: ConfigProvider,
                props: {
                    value: {
                        authStatus: {
                            endpoint: 'https://sourcegraph.example.com',
                            authenticated: true,
                        } satisfies Partial<AuthStatus> as any,
                        config: {} as any,
                        clientCapabilities: CLIENT_CAPABILITIES_FIXTURE,
                        siteHasCodyEnabled: true,
                    },
                },
            } satisfies Wrapper<any, ComponentProps<typeof ConfigProvider>>,
        ],
        []
    )
    return <ComposedWrappers wrappers={wrappers}>{children}</ComposedWrappers>
}

const DUMMY_FILES: ContextItem[] = [
    { type: 'file', uri: URI.file('a.go') },
    ...Array.from(new Array(20).keys()).map(
        i =>
            ({
                uri: URI.file(`${i ? `${'dir/'.repeat(i + 1)}` : ''}file-a-${i}.py`),
                type: 'file',
            }) satisfies ContextItem
    ),
    { type: 'file', uri: URI.file('dir/file-large.py'), isTooLarge: true },
]

const DUMMY_SYMBOLS: ContextItemSymbol[] = Array.from(new Array(20).keys()).map(
    i =>
        ({
            symbolName: `Symbol${i}`,
            kind: ['function', 'class', 'method'][i % 3] as SymbolKind,
            uri: URI.file(`a/b/file${i}.go`),
            range: {
                start: {
                    line: i + 1,
                    character: (13 * i) % 80,
                },
                end: {
                    line: ((3 * i) % 100) + 1,
                    character: 1,
                },
            },
            type: 'symbol',
        }) satisfies ContextItemSymbol
)
