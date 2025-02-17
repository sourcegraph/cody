import {
    AUTH_STATUS_FIXTURE_AUTHED,
    CHAT_PREAMBLE,
    CLIENT_CAPABILITIES_FIXTURE,
    type ContextItem,
    ContextItemSource,
    type Message,
    ModelUsage,
    type ModelsData,
    contextFiltersProvider,
    createModel,
    graphqlClient,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
    modelsService,
    ps,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'
import { localStorage } from '../../services/LocalStorageProvider'
import { ChatBuilder } from './ChatBuilder'
import { DefaultPrompter } from './prompt'

describe('DefaultPrompter', () => {
    beforeEach(async () => {
        vi.mock('@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider', () => ({
            evaluateFeatureFlag: vi.fn().mockResolvedValue(false),
            FeatureFlagProvider: {
                evaluateFeatureFlag: vi.fn().mockResolvedValue(false),
            },
        }))
        // Mock GraphQL client with proper endpoint
        mockResolvedConfig({
            configuration: {
                overrideServerEndpoint: 'http://test.sourcegraph.com',
            },
            auth: {
                serverEndpoint: 'https://sourcegraph.com/.api/graphql',
            },
        })
        vi.spyOn(localStorage, 'getEnrollmentHistory').mockReturnValue(false)
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
        vi.spyOn(graphqlClient, 'fetchSourcegraphAPI').mockImplementation(async () => ({
            data: {
                evaluateFeatureFlag: true,
                featureFlags: {
                    evaluatedFeatureFlags: [
                        { name: 'cody-intent-detection-api', value: true },
                        { name: 'cody-unified-prompts', value: true },
                        { name: 'cody-autocomplete-tracing', value: true },
                    ],
                },
            },
        }))
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('constructs a prompt with no context', async () => {
        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
            Observable.of<ModelsData>({
                primaryModels: [
                    createModel({
                        id: 'a-model-id',
                        usage: [ModelUsage.Chat],
                        contextWindow: { input: 100000, output: 100 },
                    }),
                ],
                localModels: [],
                preferences: { defaults: {}, selected: {} },
            })
        )
        const chat = new ChatBuilder('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, context } = await new DefaultPrompter([], []).makePrompt(chat, 0)
        expect(prompt).toEqual([
            {
                speaker: 'human',
                text: CHAT_PREAMBLE,
            },
            {
                speaker: 'assistant',
                text: ps`I am Cody, an AI coding assistant from Sourcegraph.`,
            },
            {
                contextAlternatives: undefined,
                contextFiles: undefined,
                speaker: 'human',
                text: ps`Hello`,
            },
        ])
        expect(context.used).toEqual([])
        expect(context.ignored).toEqual([])
    })

    it('prompt context items are ordered in reverse order of relevance', async () => {
        const p = await PromptBuilder.create({ input: 10_000, output: 10_000 })
        const contextItems: ContextItem[] = [
            {
                type: 'file',
                uri: vscode.Uri.parse('file:///one'),
                content: 'context one',
            },
            {
                type: 'file',
                uri: vscode.Uri.parse('file:///two'),
                content: 'context two',
            },
        ]
        p.tryAddToPrefix([
            { speaker: 'human', text: ps`preamble` },
            { speaker: 'assistant', text: ps`preamble response` },
        ])
        p.tryAddMessages([{ speaker: 'human', text: ps`user message` }])
        await p.tryAddContext('corpus', contextItems)
        const messages = p.build()
        checkPrompt(messages, [
            'preamble',
            'preamble response',
            'context two',
            'Ok.',
            'context one',
            'Ok.',
            'user message',
        ])
        // expect(messages).toEqual([])
    })

    it('adds the cody.chat.preInstruction vscode setting if set', async () => {
        mockResolvedConfig({
            configuration: {
                chatPreInstruction: ps`Always respond with 🧀 emojis`,
            },
        })

        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
            Observable.of<ModelsData>({
                primaryModels: [
                    createModel({
                        id: 'a-model-id',
                        usage: [ModelUsage.Chat],
                        contextWindow: { input: 100000, output: 100 },
                    }),
                ],
                localModels: [],
                preferences: { defaults: {}, selected: {} },
            })
        )

        const chat = new ChatBuilder('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, context } = await new DefaultPrompter([], []).makePrompt(chat, 0)
        expect(prompt).toEqual([
            {
                speaker: 'human',
                text: ps`${CHAT_PREAMBLE}\n\nAlways respond with 🧀 emojis`,
            },
            {
                speaker: 'assistant',
                text: ps`I am Cody, an AI coding assistant from Sourcegraph.`,
            },
            {
                contextAlternatives: undefined,
                contextFiles: undefined,
                speaker: 'human',
                text: ps`Hello`,
            },
        ])
        expect(context.used).toEqual([])
        expect(context.ignored).toEqual([])
    })

    it('prefers latest context', async () => {
        vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
            Observable.of<ModelsData>({
                primaryModels: [
                    createModel({
                        id: 'a-model-id',
                        usage: [ModelUsage.Chat],
                        contextWindow: { input: 100000, output: 100 },
                    }),
                ],
                localModels: [],
                preferences: { defaults: {}, selected: {} },
            })
        )

        const chat = new ChatBuilder('a-model-id')
        chat.addHumanMessage({ text: ps`Hello, world!` })

        // First chat message
        let info = await new DefaultPrompter(
            [
                {
                    uri: vscode.Uri.file('user1.go'),
                    type: 'file',
                    content: 'package vscode',
                    source: ContextItemSource.User,
                },
            ],
            [
                {
                    uri: vscode.Uri.file('enhanced1.ts'),
                    type: 'file',
                    content: 'import vscode',
                },
            ]
        ).makePrompt(chat, 0)

        checkPrompt(info.prompt, [
            'You are Cody, an AI coding assistant from Sourcegraph.',
            'I am Cody, an AI coding assistant from Sourcegraph.',
            'Codebase context from file enhanced1.ts',
            'Ok.',
            'Codebase context from file user1.go',
            'Ok.',
            'Hello, world!',
        ])

        chat.setLastMessageContext(info.context.used)
        chat.addBotMessage({ text: ps`Oh hello there.` }, 'my-model')
        chat.addHumanMessage({ text: ps`Hello again!` })

        // Second chat should give highest priority to new context (both explicit and enhanced)
        info = await new DefaultPrompter(
            [
                {
                    uri: vscode.Uri.file('user2.go'),
                    type: 'file',
                    content: 'package vscode',
                    source: ContextItemSource.User,
                },
            ],
            [
                {
                    uri: vscode.Uri.file('enhanced2.ts'),
                    type: 'file',
                    content: 'import vscode',
                },
            ]
        ).makePrompt(chat, 0)

        checkPrompt(info.prompt, [
            'You are Cody, an AI coding assistant from Sourcegraph.',
            'I am Cody, an AI coding assistant from Sourcegraph.',
            'Codebase context from file enhanced1.ts',
            'Ok.',
            'Codebase context from file user1.go',
            'Ok.',
            'Codebase context from file enhanced2.ts',
            'Ok.',
            'Codebase context from file user2.go',
            'Ok.',
            'Hello, world!',
            'Oh hello there.',
            'Hello again!',
        ])
    })

    function checkPrompt(prompt: Message[], expectedPrefixes: string[]): void {
        for (let i = 0; i < expectedPrefixes.length; i++) {
            const actual = prompt[i].text?.toString()
            const expected = expectedPrefixes[i]
            if (!actual?.includes(expected)) {
                expect.fail(
                    `Message mismatch: expected ${JSON.stringify(actual)} to include ${JSON.stringify(
                        expectedPrefixes[i]
                    )}`
                )
            }
        }
        expect(prompt.length).toBe(expectedPrefixes.length)
    }
})
