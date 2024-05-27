import { type Locator, expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { createEmptyChatPanel, sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, executeCommandInPalette, test } from './helpers'

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
    await page.keyboard.press('Alt+L')
    await expect(firstChatInput).toBeFocused()

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

    // Make sure the chat input box does not steal focus from the editor when editor
    // is focused.
    await expect(firstChatInput).toBeFocused()
    await page.getByText("fizzbuzz.push('Buzz')").click()
    await expect(firstChatInput).not.toBeFocused()
    // once the response is 'Done', check the input focus
    await firstChatInput.hover()
    await expect(chatPanel.getByText('Done')).toBeVisible()
    await expect(firstChatInput).not.toBeFocused()

    // Click into the last chat input and submit a new follow-up chat message. The original focus
    // area which is the chat input should still have the focus after the response is received.
    await lastChatInput.click()
    await lastChatInput.type('Regular chat message', { delay: 10 })
    await lastChatInput.press('Enter')
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    await expect(chatInputs.nth(1)).toBeFocused()
})

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })(
    'chat toolbar and row UI',
    async ({ page, sidebar }) => {
        await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

        // This test requires that the window be focused in the OS window manager because it deals with
        // focus.
        await page.bringToFront()

        await sidebarSignin(page, sidebar)
        const [chatPanel, lastChatInput] = await createEmptyChatPanel(page)

        function nthHumanMessageRow(n: number): Locator {
            return chatPanel
                .locator('[role="row"][data-testid="message"]:has([data-lexical-editor="true"])')
                .nth(n)
        }
        function humanMessageRowParts(row: Locator): {
            editor: Locator
            toolbar: {
                mention: Locator
                enhancedContext: Locator
                modelSelector: Locator
                submit: Locator
            }
        } {
            const toolbar = row.locator('[role="toolbar"]')
            return {
                editor: row.locator('[data-lexical-editor="true"]'),
                toolbar: {
                    mention: toolbar.getByRole('button', { name: 'Add context' }),
                    enhancedContext: toolbar.getByRole('button', {
                        name: 'Configure automatic code context',
                    }),
                    modelSelector: toolbar.getByRole('combobox', { name: 'Select a model' }),
                    submit: toolbar.getByRole('button', { name: 'Send with automatic code context' }),
                },
            }
        }

        // Ensure the chat toolbar is visible even when it's not focused because it's the last human
        // input.
        const humanRow0 = humanMessageRowParts(nthHumanMessageRow(0))
        await humanRow0.editor.blur()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.enhancedContext).toBeVisible()
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
        await expect(humanRow0.editor).toBeFocused()
        await humanRow0.editor.blur()
        await expect(humanRow0.toolbar.mention).not.toBeVisible()
        await expect(humanRow0.toolbar.enhancedContext).not.toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).not.toBeVisible()
        await expect(humanRow0.toolbar.submit).not.toBeVisible()

        // Now check the interactions on the first human message row again. The toolbar should still
        // work when clicking among different toolbar popovers. When the first message input loses
        // focus, it hides the toolbar, but that should not interfere with clicking among toolbar items.
        await humanRow0.editor.focus()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.enhancedContext).toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).toBeVisible()
        await expect(humanRow0.toolbar.submit).toBeVisible()
        await expect(chatPanel.getByText('Optimized for Accuracy')).not.toBeVisible()
        await expect(chatPanel.getByText('Automatic code context')).not.toBeVisible()
        // Open the model selector toolbar popover.
        await humanRow0.toolbar.modelSelector.click()
        await expect(chatPanel.getByText('Optimized for Accuracy')).toBeVisible()
        await expect(chatPanel.getByText('Automatic code context')).not.toBeVisible()
        // Now click to the enhanced context toolbar popover. All toolbar items should still be visible, and the new popover should be open.
        await humanRow0.toolbar.enhancedContext.click()
        await expect(chatPanel.getByText('Optimized for Accuracy')).not.toBeVisible()
        await expect(chatPanel.getByText('Automatic code context')).toBeVisible()
        await expect(humanRow0.toolbar.mention).toBeVisible()
        await expect(humanRow0.toolbar.enhancedContext).toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).toBeVisible()
        await expect(humanRow0.toolbar.submit).toBeVisible()

        // Now focus on the last input. The first row should be minimized.
        await lastChatInput.click()
        await expect(humanRow0.toolbar.mention).not.toBeVisible()
        await expect(humanRow0.toolbar.enhancedContext).not.toBeVisible()
        await expect(humanRow0.toolbar.modelSelector).not.toBeVisible()
        await expect(humanRow0.toolbar.submit).not.toBeVisible()
    }
)

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

