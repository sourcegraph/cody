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
})('editing messages in the chat input', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const [_chatFrame, chatInput] = await createEmptyChatPanel(page)

    // Test that empty chat messages cannot be submitted.
    await chatInput.fill(' ')
    await chatInput.press('Enter')
    await expect(chatInput).toHaveText(' ')
    await chatInput.press('Backspace')
    await chatInput.clear()

    // Test that Ctrl+Arrow jumps by a word.
    await chatInput.focus()
    await chatInput.type('One')
    await chatInput.press('Control+ArrowLeft')
    await chatInput.type('Two')
    await expect(chatInput).toHaveText('TwoOne')

    // Test that Ctrl+Shift+Arrow highlights a word by trying to delete it.
    await chatInput.clear()
    await chatInput.type('One')
    await chatInput.press('Control+Shift+ArrowLeft')
    await chatInput.press('Delete')
    await expect(chatInput).toHaveText('')

    // Chat input should have focused after sending a message.
    await expect(chatInput).toBeFocused()
    await chatInput.fill('Chat events on submit')
    await chatInput.press('Enter')
})

test('chat input focus', async ({ page, sidebar }) => {
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
    await page.click('.badge[aria-label="Cody"]')
    const [chatPanel, chatInput] = await createEmptyChatPanel(page)
    await page.click('.badge[aria-label="Cody"]')
    await page.getByRole('tab', { name: 'buzz.ts' }).dblclick()

    // Submit a new chat question from the command menu.
    await page.getByLabel(/Commands \(/).hover()
    await page.getByLabel(/Commands \(/).click()
    await page.waitForTimeout(100)
    // HACK: The 'delay' command is used to make sure the response is streamed 400ms after
    // the command is sent. This provides us with a small window to move the cursor
    // from the new opened chat window back to the editor, before the chat has finished
    // streaming its response.
    await chatInput.fill('delay')
    await chatInput.press('Enter')
    await expect(chatInput).toBeFocused()

    // Ensure equal-width columns so we can be sure the code we're about to click is in view (and is
    // not out of the editor's scroll viewport). This became required due to new (undocumented)
    // behavior in VS Code 1.88.0 where the Cody panel would take up ~80% of the width when it was
    // focused, meaning that the buzz.ts editor tab would take up ~20% and the text we intend to
    // click would be only partially visible, making the click() call fail.
    await executeCommandInPalette(page, 'View: Reset Editor Group Sizes')

    // Make sure the chat input box does not steal focus from the editor when editor
    // is focused.
    await page.getByText("fizzbuzz.push('Buzz')").click()
    await expect(chatInput).not.toBeFocused()
    // once the response is 'Done', check the input focus
    await chatInput.hover()
    await expect(chatPanel.getByText('Done')).toBeVisible()
    await expect(chatInput).not.toBeFocused()

    // Click on the chat input box to make sure it now has the focus, before submitting
    // a new chat question. The original focus area which is the chat input should still
    // have the focus after the response is received.
    await chatInput.click()
    await expect(chatInput).toBeFocused()
    await chatInput.type('Regular chat message', { delay: 10 })
    await chatInput.press('Enter')
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    await expect(chatInput).toBeFocused()
})

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })(
    'chat model selector',
    async ({ page, sidebar }) => {
        await sidebarSignin(page, sidebar)

        const [chatFrame, chatInput] = await createEmptyChatPanel(page)

        const modelSelect = chatFrame.getByRole('combobox', { name: 'Choose a model' })

        // Model selector is initially enabled.
        await expect(modelSelect).toBeEnabled()

        // Immediately after submitting the first message, the model selector is disabled.
        await chatInput.fill('Hello')
        await chatInput.press('Enter')
        await expect(modelSelect).toBeDisabled()
    }
)

test('chat readability: long text are wrapped and scrollable in chat views', async ({
    page,
    sidebar,
}) => {
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

    // Verify if whitespaces are preserved in the chat view for human messages
    const humanText = chatFrame.getByText('Lorem ipsum Cody.')
    await expect(humanText).toHaveText(/\s\s\s\sname: string/)

    const humanTextContainerBox = await humanText.boundingBox()
    expect(humanTextContainerBox?.width).toBeLessThan(welcomeTextContainerWidth)

    // Code block should be scrollable
    const codeBlock = chatFrame.locator('pre').last()
    expect(codeBlock).toBeVisible()
    const codeBlockElement = await codeBlock.boundingBox()
    expect(codeBlockElement?.width).toBeLessThan(welcomeTextContainerWidth)

    // Go to the bottom of the chat transcript view
    await codeBlock.click()
    await page.keyboard.press('PageDown')

    const botResponseText = chatFrame.getByText('Excepteur')
    await expect(botResponseText).toBeVisible()

    // The response text element and the code block element should have the same width
    const botResponseElement = await botResponseText.boundingBox()
    expect(botResponseElement?.width).toBeLessThan(welcomeTextContainerWidth)
})
