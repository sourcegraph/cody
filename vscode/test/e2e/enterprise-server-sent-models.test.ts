import { expect } from '@playwright/test'
import { createEmptyChatPanel, sidebarSignin } from './common'
import { test } from './helpers'
import { SERVER_MODELS } from './utils/server-models'

test('allows multiple enterprise models when server-sent models is enabled', async ({
    page,
    server,
    sidebar,
}) => {
    server.setAvailableLLMs(SERVER_MODELS)
    await sidebarSignin(page, sidebar, { enableNotifications: true })
    // Open chat.
    const [chatFrame] = await createEmptyChatPanel(page)
    let modelSelect = chatFrame.getByTestId('chat-model-selector')

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
    modelSelect = newChatFrame.getByTestId('chat-model-selector')

    // First model in the server list should be selected as default
    await expect(modelSelect).toBeEnabled()
    await expect(modelSelect).toHaveText(/^Titan/)
})
