import { expect } from '@playwright/test'

import { createEmptyChatPanel, focusChatInputAtEnd, sidebarSignin } from './common'
import { type ExpectedEvents, test } from './helpers'

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
        'CodyVSCodeExtension:editChatButton:clicked',
    ],
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth:failed',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.editChatButton:clicked',
    ],
})('editing follow-up messages in chat view', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const [chatFrame, lastChatInput, firstChatInput, chatInputs] = await createEmptyChatPanel(page)

    // Submit three new messages
    await lastChatInput.fill('One')
    await lastChatInput.press('Enter')
    await expect(chatFrame.getByText('One')).toBeVisible()
    await lastChatInput.fill('Two')
    await lastChatInput.press('Enter')
    await expect(chatFrame.getByText('Two')).toBeVisible()
    await lastChatInput.fill('Three')
    await lastChatInput.press('Enter')
    await expect(chatFrame.getByText('Three')).toBeVisible()

    // Click on the first input to get into the editing mode
    // The text area should automatically get the focuse,
    // and contains the original message text,
    // The submit button will also be replaced with "Update Message" button
    await chatFrame.getByText('One').hover()
    await focusChatInputAtEnd(firstChatInput)
    await expect(firstChatInput).toBeFocused()
    await expect(firstChatInput).toHaveText('One')

    // click on the second edit button to get into the editing mode again
    // edit the message from "Two" to "Four"
    const secondChatInput = chatInputs.nth(1)
    await chatFrame.getByText('Two').hover()
    // the original message text should shows up in the text box
    await expect(secondChatInput).toHaveText('Two')
    await secondChatInput.click()
    await secondChatInput.fill('Four')
    await page.keyboard.press('Enter')

    // Only two messages are left after the edit (e.g. "One", "Four"),
    // as all the messages after the edited message have be removed
    await expect(chatInputs).toHaveCount(3 /* 2 + the 1 for the next not-yet-sent message */)
    await expect(chatFrame.getByText('One')).toBeVisible()
    await expect(chatFrame.getByText('Two')).not.toBeVisible()
    await expect(chatFrame.getByText('Three')).not.toBeVisible()
    await expect(chatFrame.getByText('Four')).toBeVisible()

    // Chat input should still have focus.
    await expect(secondChatInput).toBeFocused()
})
