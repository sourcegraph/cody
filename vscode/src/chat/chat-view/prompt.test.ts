import { ModelProvider, ModelUsage, contextFiltersProvider } from '@sourcegraph/cody-shared'
import { type ContextItem, type Message, ps } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'
import { SimpleChatModel } from './SimpleChatModel'
import { DefaultPrompter } from './prompt'

describe('DefaultPrompter', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
    })
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('constructs a prompt with no context', async () => {
        ModelProvider.setProviders([
            new ModelProvider('a-model-id', [ModelUsage.Chat], { input: 100000, output: 100 }),
        ])
        const chat = new SimpleChatModel('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, newContextUsed } = await new DefaultPrompter([], () =>
            Promise.resolve([])
        ).makePrompt(chat, 0)

        expect(prompt).toEqual<Message[]>([
            {
                speaker: 'human',
                text: ps`You are Cody, an AI coding assistant from Sourcegraph.`,
            },
            {
                speaker: 'assistant',
                text: ps`I am Cody, an AI coding assistant from Sourcegraph.`,
            },
            {
                speaker: 'human',
                text: ps`Hello`,
            },
        ])
        expect(newContextUsed).toEqual([])
    })

    it('adds the cody.chat.preInstruction vscode setting if set', async () => {
        const getConfig = vi.spyOn(vscode.workspace, 'getConfiguration')
        getConfig.mockImplementation((section, resource) => ({
            get: vi.fn(() => 'Always respond with 🧀 emojis'),
            has: vi.fn(() => true),
            inspect: vi.fn(() => ({ key: 'key' })),
            update: vi.fn(() => Promise.resolve()),
        }))

        ModelProvider.setProviders([
            new ModelProvider('a-model-id', [ModelUsage.Chat], { input: 100000, output: 100 }),
        ])
        const chat = new SimpleChatModel('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, newContextUsed } = await new DefaultPrompter([], () =>
            Promise.resolve([])
        ).makePrompt(chat, 0)

        expect(prompt).toEqual<Message[]>([
            {
                speaker: 'human',
                text: ps`You are Cody, an AI coding assistant from Sourcegraph. Always respond with 🧀 emojis`,
            },
            {
                speaker: 'assistant',
                text: ps`I am Cody, an AI coding assistant from Sourcegraph.`,
            },
            {
                speaker: 'human',
                text: ps`Hello`,
            },
        ])
        expect(newContextUsed).toEqual([])
    })

    it('tryAddContext limit should not allow prompt to exceed overall limit', async () => {
        const promptBuilder = new PromptBuilder({ input: 10, output: 100 })
        const preamble: Message[] = [{ speaker: 'system', text: ps`Hi!` }]
        promptBuilder.tryAddToPrefix(preamble)
        const transcript: Message[] = [
            { speaker: 'human', text: ps`Hi!` },
            { speaker: 'assistant', text: ps`Hi!` },
        ]
        promptBuilder.tryAddMessages([...transcript].reverse())

        const contextItems: ContextItem[] = [
            {
                type: 'file',
                uri: vscode.Uri.file('/foo/bar'),
                content: 'This is a file that exceeds the token limit',
                isTooLarge: true,
            },
        ]

        const { limitReached, ignored, duplicate, used } = await promptBuilder.tryAddContext(
            'enhanced',
            contextItems
        )
        expect(limitReached).toBeTruthy()
        expect(ignored).toEqual(contextItems)
        expect(duplicate).toEqual([])
        expect(used).toEqual([])

        const prompt = promptBuilder.build()
        expect(prompt).toEqual([...preamble, ...transcript])
    })
})
