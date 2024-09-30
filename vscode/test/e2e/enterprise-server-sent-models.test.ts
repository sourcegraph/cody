import { expect } from '@playwright/test'
import type { ModelCategory, ModelTier, ServerModelConfiguration } from '@sourcegraph/cody-shared'
import { createEmptyChatPanel, sidebarSignin } from './common'
import { test } from './helpers'

test('allows multiple enterprise models when server-sent models is enabled', async ({
    page,
    server,
    sidebar,
}) => {
    server.setAvailableLLMs(SERVER_MODELS)
    await sidebarSignin(page, sidebar, true)
    // Open chat.
    const [chatFrame] = await createEmptyChatPanel(page)
    let modelSelect = chatFrame.getByRole('combobox', { name: 'Select a model' }).last()

    // First model in the server list should be selected as default
    await expect(modelSelect).toBeEnabled()
    await expect(modelSelect).toHaveText(/^Opus/)

    // Change selection to Titan and assert it was updated
    // Note: currently the backend doesn't respect frontend enterprise
    // model selection so we don't test that it switches models here
    await modelSelect.click()
    const modelChoices = chatFrame.getByRole('listbox', { name: 'Suggestions' })
    await modelChoices.getByRole('option', { name: 'Titan' }).click()
    await expect(modelSelect).toHaveText(/^Titan/)

    // Close chat window and create a new one and assert the default model is preserved
    const chatTab = page.getByRole('tab', { name: 'New Chat' })
    await chatTab.getByRole('button', { name: /^Close/ }).click()

    const [newChatFrame] = await createEmptyChatPanel(page)
    modelSelect = newChatFrame.getByRole('combobox', { name: 'Select a model' }).last()

    // First model in the server list should be selected as default
    await expect(modelSelect).toBeEnabled()
    await expect(modelSelect).toHaveText(/^Titan/)
})

const SERVER_MODELS: ServerModelConfiguration = {
    schemaVersion: '1.0',
    revision: '-',
    providers: [],
    models: [
        {
            modelRef: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
            displayName: 'Opus',
            modelName: 'anthropic.claude-3-opus-20240229-v1_0',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::anthropic.claude-instant-v1',
            displayName: 'Instant',
            modelName: 'anthropic.claude-instant-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::amazon.titan-text-lite-v1',
            displayName: 'Titan',
            modelName: 'amazon.titan-text-lite-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
    ],
    defaultModels: {
        chat: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
        fastChat: 'anthropic::unknown::amazon.titan-text-lite-v1',
        codeCompletion: 'anthropic::unknown::anthropic.claude-instant-v1',
    },
}
