import { Model, ModelUsage, ModelsService, contextFiltersProvider } from '@sourcegraph/cody-shared'
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

        const { promptInfo } = await new DefaultPrompter([], () => Promise.resolve([])).makePrompt(
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
        expect(promptInfo.context.used).toEqual([])
        expect(promptInfo.context.ignored).toEqual([])
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

        const { promptInfo } = await new DefaultPrompter([], () => Promise.resolve([])).makePrompt(
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
        expect(promptInfo.context.used).toEqual([])
        expect(promptInfo.context.ignored).toEqual([])
    })
})
