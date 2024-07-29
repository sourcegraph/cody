import { expect } from '@playwright/test'
import { createEmptyChatPanel, focusSidebar, sidebarSignin } from './common'
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
})('restore chat from sidebar history view - plg', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Ensure the chat view is ready before we start typing
    await expect(chatPanelFrame.getByText('to add context to your chat')).toBeVisible()

    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    await focusSidebar(page)
    await chatPanelFrame.locator('[id="radix-\\:r0\\:-trigger-history"]').getByRole('button').click()

    const newHistoryItem = chatPanelFrame.getByRole('button', { name: 'Hey' })
    await expect(newHistoryItem).toBeVisible()
    await newHistoryItem.click()
})
