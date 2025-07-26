import { expect } from '@playwright/test'
import { getChatInputs, getChatSidebarPanel, sidebarSignin } from './common'
import { type ExpectedV2Events, test } from './helpers'

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('restore and delete chat from sidebar history view', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const sidebarChat = getChatSidebarPanel(page)

    const sidebarTabHistoryButton = sidebarChat.getByTestId('tab-history')

    // Ensure the chat view is ready before we start typing
    await expect(sidebarTabHistoryButton).toBeVisible()

    const chatInput = getChatInputs(sidebarChat).first()
    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    await sidebarTabHistoryButton.click()

    await expect(sidebarChat.getByRole('button', { name: 'Export' })).toBeVisible()
    await expect(sidebarChat.getByRole('button', { name: 'Delete all' })).toBeVisible()
    await sidebarChat.getByRole('button', { name: 'Delete all' }).click()
    await expect(sidebarChat.getByRole('button', { name: 'Delete all chats' })).toBeVisible()
    await sidebarChat.getByRole('button', { name: 'Cancel' }).click()
    await expect(sidebarChat.getByRole('button', { name: 'Delete all chats' })).not.toBeVisible()

    const newHistoryItem = sidebarChat.getByRole('option', { name: 'Hey' })
    await expect(newHistoryItem).toBeVisible()
    const deleteButton = sidebarChat.getByLabel('delete-history-button')
    await deleteButton.click()

    await expect(newHistoryItem).not.toBeVisible()
    await expect(sidebarChat.getByText('You have no chat history')).toBeVisible()
})
