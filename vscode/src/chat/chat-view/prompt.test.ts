import {
    ContextItemSource,
    Model,
    ModelUsage,
    ModelsService,
    contextFiltersProvider,
} from '@sourcegraph/cody-shared'
import { type Message, ps } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
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
        ModelsService.setModels([
            new Model('a-model-id', [ModelUsage.Chat], { input: 100000, output: 100 }),
        ])
        const chat = new SimpleChatModel('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, context } = await new DefaultPrompter([], () => Promise.resolve([])).makePrompt(
            chat,
            0
        )

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
        expect(context.used).toEqual([])
        expect(context.ignored).toEqual([])
    })

    it('adds the cody.chat.preInstruction vscode setting if set', async () => {
        const getConfig = vi.spyOn(vscode.workspace, 'getConfiguration')
        getConfig.mockImplementation((section, resource) => ({
            get: vi.fn(() => 'Always respond with 🧀 emojis'),
            has: vi.fn(() => true),
            inspect: vi.fn(() => ({ key: 'key' })),
            update: vi.fn(() => Promise.resolve()),
        }))

        ModelsService.setModels([
            new Model('a-model-id', [ModelUsage.Chat], { input: 100000, output: 100 }),
        ])
        const chat = new SimpleChatModel('a-model-id')
        chat.addHumanMessage({ text: ps`Hello` })

        const { prompt, context } = await new DefaultPrompter([], () => Promise.resolve([])).makePrompt(
            chat,
            0
        )

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
        expect(context.used).toEqual([])
        expect(context.ignored).toEqual([])
    })

    it('prefers latest enhanced context', async () => {
        ModelsService.setModels([
            new Model('a-model-id', [ModelUsage.Chat], { input: 100000, output: 100 }),
        ])
        const chat = new SimpleChatModel('a-model-id')
        chat.addHumanMessage({ text: ps`Hello, world!` })

        // First chat message
        let info = await new DefaultPrompter(
            [
                {
                    uri: vscode.Uri.file('user1.go'),
                    type: 'file',
                    content: 'import vscode',
                    source: ContextItemSource.User,
                },
            ],
            () =>
                Promise.resolve([
                    {
                        uri: vscode.Uri.file('enhanced1.ts'),
                        type: 'file',
                        content: 'import vscode',
                    },
                ])
        ).makePrompt(chat, 0)
        chat.setLastMessageContext(info.context.used)

        checkPrompt(info.prompt, [
            'You are Cody, an AI coding assistant from Sourcegraph.',
            'I am Cody, an AI coding assistant from Sourcegraph.',
            'Codebase context from file enhanced1.ts',
            'Ok.',
            'Codebase context from file user1.go',
            'Ok.',
            'Hello, world!',
        ])

        // Second chat message should only include previous message's user-provided context
        info = await new DefaultPrompter(
            [
                {
                    uri: vscode.Uri.file('user2.go'),
                    type: 'file',
                    content: 'import vscode',
                    source: ContextItemSource.User,
                },
            ],
            () =>
                Promise.resolve([
                    {
                        uri: vscode.Uri.file('enhanced2.ts'),
                        type: 'file',
                        content: 'import vscode',
                    },
                ])
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
        ])
    })

    function checkPrompt(prompt: Message[], expectedPrefixes: string[]): void {
        expect(prompt.length).toBe(expectedPrefixes.length)
        for (let i = 0; i < expectedPrefixes.length; i++) {
            const actual = prompt[i].text?.toString()
            const expected = expectedPrefixes[i]
            expect(actual?.startsWith(expected)).toBe(true)
        }
    }
})
