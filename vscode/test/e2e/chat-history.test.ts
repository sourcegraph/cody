import { expect } from '@playwright/test'
import { getChatInputs, getChatSidebarPanel, sidebarSignin } from './common'
import { type ExpectedV2Events, test } from './helpers'

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('restore chat from sidebar history view', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const sidebarChat = getChatSidebarPanel(page)

    const sidebarTabHistoryButton = sidebarChat.getByTestId('tab-history')

    // Ensure the chat view is ready before we start typing
    await expect(sidebarTabHistoryButton).toBeVisible()

    const chatInput = getChatInputs(sidebarChat).first()
    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    await sidebarTabHistoryButton.click()

    const newHistoryItem = sidebarChat.getByRole('button', { name: 'Hey' })
    await expect(newHistoryItem).toBeVisible()
    await newHistoryItem.click()
})
