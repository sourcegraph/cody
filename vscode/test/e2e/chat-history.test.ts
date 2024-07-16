import { expect } from '@playwright/test'
import { createEmptyChatPanel, focusSidebar, sidebarSignin } from './common'
import { type ExpectedV2Events, executeCommandInPalette, test } from './helpers'

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
})('restore chat from quickPick', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    const getHeyTreeItem = async () => {
        await executeCommandInPalette(page, 'Cody: Chat History')

        // locator('#quickInput_list
        return page.locator('#quickInput_list').getByLabel('Hey, today')
    }

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Ensure the chat view is ready before we start typing
    await expect(chatPanelFrame.getByText('to add context to your chat')).toBeVisible()

    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    // TODO(beyang): fix bug that prevents immediate history propagation
    await new Promise(resolve => setTimeout(resolve, 1_000))

    // Check if chat shows up in sidebar chat history tree view
    await expect(await getHeyTreeItem()).toBeVisible()
})

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

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Ensure the chat view is ready before we start typing
    await expect(chatPanelFrame.getByText('to add context to your chat')).toBeVisible()

    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    await focusSidebar(page)
    await page.getByLabel('Settings & Support Section').click()
    await chatPanelFrame.locator('button:nth-child(2)').first().click()

    const newHistoryItem = chatPanelFrame.getByRole('button', { name: 'Hey' })
    await expect(newHistoryItem).toBeVisible()
    await newHistoryItem.click()
})
