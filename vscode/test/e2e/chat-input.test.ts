import { type Locator, expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'
import {
    createEmptyChatPanel,
    focusChatInputAtEnd,
    getChatInputs,
    getChatSidebarPanel,
    sidebarExplorer,
    sidebarSignin,
} from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    executeCommandInPalette,
    mockEnterpriseRepoIdMapping,
    test,
} from './helpers'

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.menu.command.default:clicked',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:hasCode',
    ],
})('chat input focus', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoIdMapping(server)
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
    await expect(firstChatInput).toBeFocused() // Chat should be focused initially.
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await page.getByRole('tab', { name: 'buzz.ts' }).dblclick()

    // Ensure equal-width columns so we can be sure the code we're about to click is in view (and is
    // not out of the editor's scroll viewport). This became required due to new (undocumented)
    // behavior in VS Code 1.88.0 where the Cody panel would take up ~80% of the width when it was
    // focused, meaning that the buzz.ts editor tab would take up ~20% and the text we intend to
    // click would be only partially visible, making the click() call fail.
    await executeCommandInPalette(page, 'View: Reset Editor Group Sizes')

    // Click in the file to make sure we're not focused in the chat panel. Use the Alt+L hotkey
    // (`Cody: New Chat`) to switch back to the chat window we already opened and check that the
    // input is focused.
    await page.getByText("fizzbuzz.push('Buzz')").click()

    // Submit a new chat question from the command menu.
    await page
        .locator('[id="workbench\\.parts\\.editor"]')
        .getByLabel(/Commands \(/)
        .click()
    await page.waitForTimeout(100)

    // HACK: The 'delay' command is used to make sure the response is streamed 400ms after
    // the command is sent. This provides us with a small window to move the cursor
    // from the new opened chat window back to the editor, before the chat has finished
    // streaming its response.
    await firstChatInput.fill('delay')
    await firstChatInput.press('Enter')
    await page.waitForTimeout(400)
    await expect(lastChatInput).toBeFocused()

    // Make sure the chat input box does not steal focus from the editor when editor
    // is focused.
    await expect(lastChatInput).toBeFocused()
    await page.getByText("fizzbuzz.push('Buzz')").click()
    await expect(firstChatInput).not.toBeFocused()
    await expect(lastChatInput).not.toBeFocused()
    // once the response is 'Done', check the input focus
    await firstChatInput.hover()
    await expect(chatPanel.getByText('Done')).toBeVisible()
    await expect(firstChatInput).not.toBeFocused()
    await expect(lastChatInput).not.toBeFocused()

    // Click into the last chat input and submit a new follow-up chat message. The original focus
    // area which is the chat input should still have the focus after the response is received.
    await lastChatInput.click()
    await lastChatInput.type('Regular chat message', { delay: 10 })
    await lastChatInput.press('Enter')
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    await expect(chatInputs.nth(1)).not.toBeFocused()
    await expect(lastChatInput).toBeFocused()
})

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .skip('chat toolbar and row UI', async ({ page, sidebar }) => {
        await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

        // This test requires that the window be focused in the OS window manager because it deals with
        // focus.
        await page.bringToFront()

        await sidebarSignin(page, sidebar)
        const chatPanel = getChatSidebarPanel(page)
        const lastChatInput = getChatInputs(chatPanel).last()

        function nthHumanMessageRow(n: number): Locator {
            return chatPanel
                .locator('[role="row"][data-testid="message"]:has([data-lexical-editor="true"])')
                .nth(n)
        }
        function humanMessageRowParts(row: Locator): {
            editor: Locator
            toolbar: {
                mention: Locator
                modelSelector: Locator
                submit: Locator
            }
        } {
            const toolbar = row.locator('[role="toolbar"]')
            return {
                editor: row.locator('[data-lexical-editor="true"]'),
                toolbar: {
                    mention: toolbar.getByRole('button', { name: 'Add context' }),
                    modelSelector: toolbar.getByRole('combobox', { name: 'Select a model' }),
                    submit: toolbar.getByRole('button', { name: 'Send' }),
                },
            }
        }

        // Ensure the chat toolbar is visible even when it's not focused because it's the last human
        // input.
        const humanRow0 = humanMessageRowParts(nthHumanMessageRow(0))
        await humanRow0.editor.blur()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).toBeVisible()
        await expect(humanRow0.toolbar.submit).toBeVisible()

        // Ensure that clicking the toolbar mention button focuses the editor.
        await humanRow0.toolbar.mention.click()
        await expect(humanRow0.editor).toBeFocused()

        // Now send a message.
        await humanRow0.editor.fill('Hello')
        await humanRow0.editor.press('Enter')
        await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()

        // Ensure the toolbar hides when the first input isn't focused.
        await expect(humanRow0.editor).not.toBeFocused()
        await expect(humanRow0.toolbar.mention).not.toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).not.toBeVisible()
        await expect(humanRow0.toolbar.submit).not.toBeVisible()

        // Now check the interactions on the first human message row again. The toolbar should still
        // work when clicking among different toolbar popovers. When the first message input loses
        // focus, it hides the toolbar, but that should not interfere with clicking among toolbar items.
        await humanRow0.editor.focus()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).toBeVisible()
        await expect(humanRow0.toolbar.submit).toBeVisible()
        await expect(chatPanel.getByText('Powerful Models')).not.toBeVisible()
        // Open the model selector toolbar popover.
        await humanRow0.toolbar.modelSelector.click()
        await expect(chatPanel.getByText('Powerful Models')).toBeVisible()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).toBeVisible()
        await expect(humanRow0.toolbar.submit).toBeVisible()
        // Close the model selector.
        await humanRow0.toolbar.modelSelector.click()

        // Now focus on the last input. The first row should be minimized.
        await lastChatInput.click()
        await expect(humanRow0.toolbar.mention).not.toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).not.toBeVisible()
        await expect(humanRow0.toolbar.submit).not.toBeVisible()
    })

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL }).extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('chat model selector', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

    await sidebarSignin(page, sidebar)

    const chatFrame = getChatSidebarPanel(page)
    const firstChatInput = getChatInputs(chatFrame).first()

    const modelSelect = chatFrame.getByRole('combobox', { name: 'Select a model' }).last()

    await expect(modelSelect).toBeEnabled()
    await expect(modelSelect).toHaveText(/^Claude 3.5 Sonnet/)

    await firstChatInput.fill('to model1')
    await firstChatInput.press('Enter')

    // Change model and send another message.
    await expect(modelSelect).toBeEnabled()
    await modelSelect.click()
    const modelChoices = chatFrame.getByRole('listbox', { name: 'Suggestions' })
    await modelChoices.getByRole('option', { name: 'Claude 3 Haiku' }).click()
    const lastChatInput = getChatInputs(chatFrame).last()
    await expect(lastChatInput).toBeFocused()
    await expect(modelSelect).toHaveText(/^Claude 3 Haiku/)
    await lastChatInput.fill('to model2')
    await lastChatInput.press('Enter')
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
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
    await expect(chatInputs).toHaveCount(1)
    await lastChatInput.fill('One')
    await lastChatInput.press('Enter')
    await page.waitForTimeout(1000)
    await expect(chatFrame.getByText(/One/)).toBeVisible()
    await lastChatInput.fill('Two')
    await lastChatInput.press('Enter')
    await page.waitForTimeout(1000)
    await expect(chatFrame.getByText(/Two/)).toBeVisible()
    await lastChatInput.fill('Three')
    await lastChatInput.press('Enter')
    await page.waitForTimeout(1000)
    await expect(chatFrame.getByText(/Three/)).toBeVisible()

    // Click on the first input to get into the editing mode
    // The text area should automatically get the focuse,
    // and contains the original message text,
    // The submit button will also be replaced with "Update Message" button
    await chatFrame.getByText(/One/).hover()
    await focusChatInputAtEnd(firstChatInput)
    await expect(firstChatInput).toBeFocused()
    await expect(firstChatInput).toHaveText(/One/)

    // click on the second edit button to get into the editing mode again
    // edit the message from "Two" to "Four"
    const secondChatInput = chatInputs.nth(1)
    await chatFrame.getByText('Two').hover()
    // the original message text should shows up in the text box
    await expect(secondChatInput).toHaveText(/Two/)
    await secondChatInput.click()
    await secondChatInput.fill('Four')
    await expect(chatInputs.nth(2)).toHaveText('Three')
    await page.keyboard.press('Enter')
    await expect(secondChatInput).not.toBeFocused()
    await expect(chatInputs.nth(2)).toBeFocused()
    await expect(chatInputs.nth(2)).not.toHaveText('Three')

    // Try editing again to make sure the focus behavior remains consistent.
    await chatInputs.nth(2).click()
    await chatInputs.nth(2).fill('Dummy')
    await expect(chatInputs.nth(2)).toHaveText('Dummy')
    await secondChatInput.click()
    await secondChatInput.fill('Five')
    await page.keyboard.press('Enter')
    await expect(chatInputs.nth(2)).toHaveText('Dummy')
    await expect(secondChatInput).not.toBeFocused()
    await expect(chatInputs.nth(2)).toBeFocused()

    // Only two messages are left after the edit (e.g. "One", "Four"),
    // as all the messages after the edited message have be removed
    await expect(chatInputs).toHaveCount(3 /* 2 + the 1 for the next not-yet-sent message */)
    await expect(chatFrame.getByText(/One/)).toBeVisible()
    await expect(chatFrame.getByText(/Two/)).not.toBeVisible()
    await expect(chatFrame.getByText(/Three/)).not.toBeVisible()
    await expect(chatFrame.getByText(/Five/)).toBeVisible()

    // Chat input should still have focus.
    await expect(chatInputs.nth(2)).toBeFocused()

    // Send another new message.
    await chatInputs.nth(2).click()
    await chatInputs.nth(2).fill('Six')
    await page.keyboard.press('Enter')
    await expect(chatInputs.nth(3)).toBeFocused()
})
