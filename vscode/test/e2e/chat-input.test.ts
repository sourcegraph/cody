import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import { createEmptyChatPanel, sidebarExplorer, sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExpectedEvents,
    executeCommandInPalette,
    openFile,
    test,
} from './helpers'

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
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('editing messages in the chat input', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const [_chatFrame, , firstChatInput] = await createEmptyChatPanel(page)

    // Test that empty chat messages cannot be submitted.
    await firstChatInput.fill(' ')
    await firstChatInput.press('Enter')
    await expect(firstChatInput).toHaveText(' ')
    await firstChatInput.press('Backspace')
    await firstChatInput.clear()

    // Test that Ctrl+Arrow jumps by a word.
    await firstChatInput.focus()
    await firstChatInput.type('One')
    await firstChatInput.press('Control+ArrowLeft')
    await firstChatInput.type('Two')
    await expect(firstChatInput).toHaveText('TwoOne')

    // Test that Ctrl+Shift+Arrow highlights a word by trying to delete it.
    await firstChatInput.clear()
    await firstChatInput.type('One')
    await firstChatInput.press('Control+Shift+ArrowLeft')
    await firstChatInput.press('Delete')
    await expect(firstChatInput).toHaveText('')

    // Chat input should have focused after sending a message.
    await expect(firstChatInput).toBeFocused()
    await firstChatInput.fill('Chat events on submit')
    await firstChatInput.press('Enter')
})

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:codyIgnore:hasFile',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:menu:command:default:clicked',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
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
        'cody.menu.command.default:clicked',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:hasCode',
    ],
})('chat input focus', async ({ page, sidebar }) => {
    // This test requires that the window be focused in the OS window manager because it deals with
    // focus.
    await page.bringToFront()

    await sidebarSignin(page, sidebar)
    // Open the buzz.ts file from the tree view,
    // and then submit a chat question from the command menu.
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Open a new chat panel before opening the file to make sure
    // the chat panel is right next to the document. This helps to save loading time
    // when we submit a question later as the question will be streamed to this panel
    // directly instead of opening a new one.
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    const [chatPanel, lastChatInput, firstChatInput, chatInputs] = await createEmptyChatPanel(page)
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await page.getByRole('tab', { name: 'buzz.ts' }).dblclick()

    // Submit a new chat question from the command menu.
    await page.getByLabel(/Commands \(/).click()
    await page.waitForTimeout(100)
    // HACK: The 'delay' command is used to make sure the response is streamed 400ms after
    // the command is sent. This provides us with a small window to move the cursor
    // from the new opened chat window back to the editor, before the chat has finished
    // streaming its response.
    await firstChatInput.fill('delay')
    await firstChatInput.press('Enter')
    await expect(firstChatInput).toBeFocused()
    await firstChatInput.click()

    // Ensure equal-width columns so we can be sure the code we're about to click is in view (and is
    // not out of the editor's scroll viewport). This became required due to new (undocumented)
    // behavior in VS Code 1.88.0 where the Cody panel would take up ~80% of the width when it was
    // focused, meaning that the buzz.ts editor tab would take up ~20% and the text we intend to
    // click would be only partially visible, making the click() call fail.
    await executeCommandInPalette(page, 'View: Reset Editor Group Sizes')

    // Make sure the chat input box does not steal focus from the editor when editor
    // is focused.
    await page.getByText("fizzbuzz.push('Buzz')").click()
    await expect(firstChatInput).not.toBeFocused()
    // once the response is 'Done', check the input focus
    await firstChatInput.hover()
    await expect(chatPanel.getByText('Done')).toBeVisible()
    await expect(firstChatInput).not.toBeFocused()

    // Click on the chat input box to make sure it now has the focus, before submitting
    // a new chat question. The original focus area which is the chat input should still
    // have the focus after the response is received.
    await lastChatInput.click()
    await expect(lastChatInput).toBeFocused()
    await lastChatInput.type('Regular chat message', { delay: 10 })
    await lastChatInput.press('Enter')
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    await expect(chatInputs.nth(1)).toBeFocused()
})

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL }).extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:codyIgnore:hasFile',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
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
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('chat model selector', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

    await sidebarSignin(page, sidebar)

    const [chatFrame, chatInput] = await createEmptyChatPanel(page)

    const modelSelect = chatFrame.getByRole('combobox', { name: 'Select a model' }).last()

    await expect(modelSelect).toBeEnabled()
    await expect(modelSelect).toHaveText(/^Claude 3 Sonnet/)

    await chatInput.fill('to model1')
    await chatInput.press('Enter')
    await expect(chatFrame.getByRole('row').getByTitle('Claude 3 Sonnet by Anthropic')).toBeVisible()

    // Change model and send another message.
    await expect(modelSelect).toBeEnabled()
    await modelSelect.click()
    const modelChoices = chatFrame.getByRole('listbox', { name: 'Suggestions' })
    await modelChoices.getByRole('option', { name: 'GPT-4o' }).click()
    await expect(chatInput).toBeFocused()
    await expect(modelSelect).toHaveText(/^GPT-4o/)
    await chatInput.fill('to model2')
    await chatInput.press('Enter')
    await expect(chatFrame.getByRole('row').getByTitle('GPT-4o by OpenAI')).toBeVisible()
})

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:codyIgnore:hasFile',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:hasCode',
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
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:hasCode',
    ],
})('chat readability: long text are wrapped and scrollable in chat views', async ({ page, sidebar }) => {
    // Open a file before starting a new chat to make sure chat will be opened on the side
    await sidebarSignin(page, sidebar)
    await openFile(page, 'buzz.test.ts')
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)

    // Use the width of the welcome chat to determine if the chat messages are wrapped.
    const welcomeText = chatFrame.getByText('Welcome to Cody')
    const welcomeTextContainer = await welcomeText.boundingBox()
    const welcomeTextContainerWidth = welcomeTextContainer?.width || 0
    expect(welcomeTextContainerWidth).toBeGreaterThan(0)

    await chatInput.fill(
        `Lorem ipsum Cody.
        export interface Animal {
                name: string
                makeAnimalSound(): string
                isMammal: boolean
                printName(): void {
                    console.log(this.name);
                }
            }
        }
        `
    )

    await chatInput.press('Enter')

    // Code block should be scrollable
    const codeBlock = chatFrame.locator('pre').last()
    expect(codeBlock).toBeVisible()
    const codeBlockElement = await codeBlock.boundingBox()
    expect(codeBlockElement?.width).toBeLessThanOrEqual(welcomeTextContainerWidth)

    // Go to the bottom of the chat transcript view
    await codeBlock.click()
    await page.keyboard.press('PageDown')

    const botResponseText = chatFrame.getByText('Excepteur')
    await expect(botResponseText).toBeVisible()

    // The response text element and the code block element should have the same width
    const botResponseElement = await botResponseText.boundingBox()
    expect(botResponseElement?.width).toBeLessThanOrEqual(welcomeTextContainerWidth)
})
