import {
    AUTH_STATUS_FIXTURE_AUTHED,
    CLIENT_CAPABILITIES_FIXTURE,
    type ContextItem,
    ContextItemSource,
    type Message,
    ModelUsage,
    type ModelsData,
    contextFiltersProvider,
    createModel,
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
import { ChatBuilder } from './ChatBuilder'
import { DefaultPrompter } from './prompt'

describe('DefaultPrompter', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        mockResolvedConfig({ configuration: {} })
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
        expect(prompt).toMatchInlineSnapshot(`
          [
            {
              "speaker": "human",
              "text": "You are Cody, an AI coding assistant from Sourcegraph.If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH\`\`\`
          For executable terminal commands: enclose each command in individual "bash" language code block without comments and new lines inside.",
            },
            {
              "speaker": "assistant",
              "text": "I am Cody, an AI coding assistant from Sourcegraph.",
            },
            {
              "contextAlternatives": undefined,
              "contextFiles": undefined,
              "speaker": "human",
              "text": "Hello",
            },
          ]
        `)
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
        expect(prompt).toMatchInlineSnapshot(`
          [
            {
              "speaker": "human",
              "text": "You are Cody, an AI coding assistant from Sourcegraph.If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH\`\`\`
          For executable terminal commands: enclose each command in individual "bash" language code block without comments and new lines inside.

          Always respond with 🧀 emojis",
            },
            {
              "speaker": "assistant",
              "text": "I am Cody, an AI coding assistant from Sourcegraph.",
            },
            {
              "contextAlternatives": undefined,
              "contextFiles": undefined,
              "speaker": "human",
              "text": "Hello",
            },
          ]
        `)
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
            'enhanced1.ts',
            'Ok.',
            'user1.go',
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
            'enhanced1.ts',
            'Ok.',
            'user1.go',
            'Ok.',
            'enhanced2.ts',
            'Ok.',
            'user2.go',
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
