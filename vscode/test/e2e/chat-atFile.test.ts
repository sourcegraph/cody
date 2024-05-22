import { type FrameLocator, type Locator, expect } from '@playwright/test'
import { isWindows } from '@sourcegraph/cody-shared'
import {
    atMentionMenuItem,
    createEmptyChatPanel,
    expectContextCellCounts,
    focusChatInputAtEnd,
    getContextCell,
    sidebarExplorer,
    sidebarSignin,
} from './common'
import { type ExpectedEvents, getMetaKeyByOS, test, withPlatformSlashes } from './helpers'

// See chat-atFile.test.md for the expected behavior for this feature.
//
// NOTE: Creating new chats is slow, and setup is slow, so collapse these into fewer tests.

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        // This is fired on empty @-mention query for open tabs context
        'CodyVSCodeExtension:at-mention:executed',
        // Log once on the first character entered for an @-mention query, e.g. "@."
        'CodyVSCodeExtension:at-mention:file:executed',
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
        'cody.at-mention:executed',
        'cody.at-mention.file:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('@-mention file in chat', async ({ page, sidebar }) => {
    // This test requires that the window be focused in the OS window manager because it deals with
    // focus.
    await page.bringToFront()

    await sidebarSignin(page, sidebar)

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    await chatInput.dblclick()
    await chatInput.focus()
    await page.keyboard.type('@')
    await expect(chatPanelFrame.getByRole('option', { selected: true })).toHaveText('Files')
    await page.keyboard.press('Backspace')

    // No results
    await chatInput.fill('@definitelydoesntexist')
    await expect(atMentionMenuItem(chatPanelFrame, 'No files found')).toBeVisible()

    // Clear the input so the next test doesn't detect the same text already visible from the previous
    // check (otherwise the test can pass even without the filter working).
    await chatInput.clear()

    // We should only match the relative visible path, not parts of the full path outside of the workspace.
    // Eg. searching for "source" should not find all files if the project is inside `C:\Source`.
    // TODO(dantup): After https://github.com/sourcegraph/cody/pull/2235 lands, add workspacedirectory to the test
    //   and assert that it contains `fixtures` to ensure this check isn't passing because the fixture folder no
    //   longer matches.
    await chatInput.fill('@fixtures') // fixture is in the test project folder name, but not in the relative paths.
    await expect(atMentionMenuItem(chatPanelFrame, 'No files found')).toBeVisible()

    // Includes dotfiles after just "."
    await chatInput.fill('@.')
    await expect(chatPanelFrame.getByRole('option', { name: '.mydotfile' })).toBeVisible()

    // Forward slashes
    await chatInput.fill('@lib/batches/env')
    await expect(
        chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go lib/batches/env') })
    ).toBeVisible()

    // Backslashes
    if (isWindows()) {
        await chatInput.fill('@lib\\batches\\env')
        await expect(
            chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go lib/batches/env') })
        ).toBeVisible()
    }

    // Space before @ is required unless it's at position 0
    await chatInput.fill('Explain@mj')
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).not.toBeVisible()
    await chatInput.fill('@mj')
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).toBeVisible()
    await chatInput.fill('clear')

    // Searching and clicking
    await chatInput.fill('Explain @mj')
    await chatPanelFrame.getByRole('option', { name: 'Main.java' }).click()
    await expect(chatInput).toHaveText('Explain @Main.java ')
    await expect(chatInput.getByText('@Main.java')).toHaveClass(/context-item-mention-node/)
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(chatPanelFrame.getByText('Explain @Main.java')).toBeVisible()
    const contextCell = getContextCell(chatPanelFrame)
    await expect(contextCell).toHaveCount(1)
    await expect(chatInput).not.toHaveText('Explain @Main.java ')
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).not.toBeVisible()

    // Keyboard nav through context files
    await chatInput.fill('Explain @var.go')
    await expect(
        chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go lib/batches/env') })
    ).toBeVisible()
    await chatInput.press('Tab')
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText(withPlatformSlashes('Explain @lib/batches/env/var.go '))
    await chatInput.focus()
    await chatInput.pressSequentially('and ')
    await chatInput.pressSequentially('@vgo', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'visualize.go' })).toBeVisible()
    await expect(chatPanelFrame.getByRole('option', { selected: true })).toHaveText(/var\.go/)
    await chatInput.press('ArrowDown') // second item (visualize.go)
    await expect(chatPanelFrame.getByRole('option', { selected: true })).toHaveText(/visualize\.go/)
    await chatInput.press('ArrowDown') // wraps back to first item (var.go)
    await expect(chatPanelFrame.getByRole('option', { selected: true })).toHaveText(/var\.go/)
    await chatInput.press('ArrowDown') // second item again
    await expect(chatPanelFrame.getByRole('option', { selected: true })).toHaveText(/visualize\.go/)
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText(
        withPlatformSlashes(
            'Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go '
        )
    )

    // Send the message and check it was included
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(
        chatPanelFrame.getByText(
            withPlatformSlashes(
                'Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go'
            )
        )
    ).toBeVisible()

    // Ensure explicitly @-included context shows up as enhanced context
    await expect(contextCell).toHaveCount(2)

    // Check pressing tab after typing a complete filename.
    // https://github.com/sourcegraph/cody/issues/2200
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.pressSequentially('@Main.java', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).toBeVisible()
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText('@Main.java ')

    // Check pressing tab after typing a partial filename but where that complete
    // filename already exists earlier in the input.
    // https://github.com/sourcegraph/cody/issues/2243
    await chatInput.pressSequentially('and @Main.ja', { delay: 10 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText('@Main.java and @Main.java ')

    // Support @-file in mid-sentence
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.fill('Explain the file')
    await chatInput.press('ArrowLeft') // 'Explain the fil|e'
    await chatInput.press('ArrowLeft') // 'Explain the fi|le'
    await chatInput.press('ArrowLeft') // 'Explain the f|ile'
    await chatInput.press('ArrowLeft') // 'Explain the |file'
    await chatInput.press('ArrowLeft') // 'Explain the| file'
    await chatInput.press('Space') // 'Explain the | file'
    await chatInput.pressSequentially('@Main', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).toBeVisible()
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText('Explain the @Main.java file')
    // Confirm the cursor is at the end of the newly added file name with space
    await page.keyboard.press('!')
    await page.keyboard.press('Delete')
    await expect(chatInput).toHaveText('Explain the @Main.java !file')

    //  "ArrowLeft" / "ArrowRight" keys alter the query input for @-mentions.
    const noMatches = atMentionMenuItem(chatPanelFrame, 'No files found')
    await chatInput.pressSequentially(' @abcdefg')
    await expect(chatInput).toHaveText('Explain the @Main.java ! @abcdefgfile')
    await noMatches.hover()
    await expect(noMatches).toBeVisible()
    await chatInput.press('ArrowLeft')
    await expect(noMatches).toBeVisible()
    await chatInput.press('ArrowRight')
    await expect(noMatches).toBeVisible()
    await chatInput.press('$')
    await expect(chatInput).toHaveText('Explain the @Main.java ! @abcdefg$file')
    await expect(noMatches).not.toBeVisible()
    // Selection close on submit
    await chatInput.press('Enter')
    await expect(noMatches).not.toBeVisible()
    await expect(chatInput).toBeEmpty()

    // Query ends with non-alphanumeric character
    // with no results should not show selector.
    await chatInput.focus()
    await chatInput.fill('@unknown')
    await expect(noMatches).toBeVisible()
    await chatInput.press('$')
    await expect(chatInput).toHaveText('@unknown$')
    await expect(noMatches).not.toBeVisible()
    await chatInput.press('Backspace')
    await expect(noMatches).toBeVisible()
})

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        // This is fired on empty @-mention query for open tabs context
        'CodyVSCodeExtension:at-mention:executed',
        // Log once on the first character entered for an @-mention query, e.g. "@."
        'CodyVSCodeExtension:at-mention:file:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
        'CodyVSCodeExtension:editChatButton:clicked',
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
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth:connected',
        'cody.at-mention:executed',
        'cody.at-mention.file:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.editChatButton:clicked',
        'cody.chatResponse:noCode',
    ],
})('editing a chat message with @-mention', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const [chatPanelFrame, , firstChatInput] = await createEmptyChatPanel(page)

    // Send a message with an @-mention.
    await firstChatInput.fill('Explain @mj')
    await chatPanelFrame.getByRole('option', { name: 'Main.java' }).click()
    await expect(firstChatInput).toHaveText('Explain @Main.java ')
    await expect(firstChatInput.getByText('@Main.java')).toHaveClass(/context-item-mention-node/)
    await firstChatInput.press('Enter')
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })

    // Edit the just-sent message and resend it. Confirm it is sent with the right context items.
    await expect(firstChatInput).toHaveText('Explain @Main.java ')
    await firstChatInput.press('Meta+Enter')
    await expectContextCellCounts(contextCell, { files: 1 })

    // Edit it again, add a new @-mention, and resend.
    await expect(firstChatInput).toHaveText('Explain @Main.java ')
    await focusChatInputAtEnd(firstChatInput)
    await firstChatInput.pressSequentially('and @index.ht')
    await chatPanelFrame.getByRole('option', { name: 'index.html' }).click()
    await expect(firstChatInput).toHaveText('Explain @Main.java and @index.html')
    await expect(firstChatInput.getByText('@index.html')).toHaveClass(/context-item-mention-node/)
    await firstChatInput.press('Enter')
    await expect(firstChatInput).toHaveText('Explain @Main.java and @index.html')
    await expectContextCellCounts(contextCell, { files: 2 })
})

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyVSCodeExtension:at-mention:file:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
        'CodyVSCodeExtension:chat:context:opened',
        'CodyVSCodeExtension:chat:context:fileLink:clicked',
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
        'cody.at-mention.file:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('@-mention file range', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open chat.
    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Type a file with range.
    await chatInput.fill('@buzz.ts:2-4')
    await expect(chatPanelFrame.getByRole('option', { name: 'buzz.ts Lines 2-4' })).toBeVisible()
    await chatPanelFrame.getByRole('option', { name: 'buzz.ts Lines 2-4' }).click()
    await expect(chatInput).toHaveText('@buzz.ts:2-4 ')
    // Submit the message
    await chatInput.press('Enter')

    // @-file range with the correct line range shows up in the chat view and it opens on click
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })
    await contextCell.hover()
    await contextCell.click()
    const chatContext = chatPanelFrame.locator('details').last()
    await chatContext.getByRole('link', { name: 'buzz.ts:2-4' }).hover()
    await chatContext.getByRole('link', { name: 'buzz.ts:2-4' }).click()
    const previewTab = page.getByRole('tab', { name: /buzz.ts, preview, Editor Group/ })
    await previewTab.hover()
    await expect(previewTab).toBeVisible()
})

// NOTE: @symbols does not require double tabbing to select an option.
test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyVSCodeExtension:at-mention:executed',
        'CodyVSCodeExtension:at-mention:symbol:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chatResponse:noCode',
        'CodyVSCodeExtension:chat:context:opened',
        'CodyVSCodeExtension:chat:context:fileLink:clicked',
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
        'cody.at-mention:executed',
        'cody.at-mention.symbol:executed',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('@-mention symbol in chat', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open chat.
    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Open the buzz.ts file so that VS Code starts to populate symbols.
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).click()

    // Wait for the tsserver to become ready: when sync icon disappears
    const langServerLoadingState = 'Editor Language Status: Loading'
    await expect(page.getByRole('button', { name: langServerLoadingState })).toBeVisible()
    await page.waitForSelector(`span[class*="codicon codicon-sync"]`, { state: 'detached' })
    await expect(page.getByRole('button', { name: langServerLoadingState })).not.toBeVisible()

    // Go back to the Cody chat tab
    await page.getByRole('tab', { name: 'New Chat' }).click()

    // Symbol empty state shows tooltip to search for a symbol
    await openMentionsForProvider(chatPanelFrame, chatInput, 'Symbols')

    // Symbol empty symbol results updates tooltip title to show no symbols found
    await chatInput.pressSequentially('invalide', { delay: 10 })
    await expect(atMentionMenuItem(chatPanelFrame, /^No symbols found/)).toBeVisible()

    // Clicking on a file in the selector should autocomplete the file in chat input with added space
    await openMentionsForProvider(chatPanelFrame, chatInput, 'Symbols')
    await chatInput.pressSequentially('fizzb', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'fizzbuzz()' })).toBeVisible()
    await chatPanelFrame.getByRole('option', { name: 'fizzbuzz()' }).click()
    await expect(chatInput).toHaveText('@buzz.ts:1-15#fizzbuzz() ')

    // Submit the message
    await chatInput.press('Enter')

    // Close file.
    const pinnedTab = page.getByRole('tab', { name: 'buzz.ts', exact: true })
    await pinnedTab.getByRole('button', { name: /^Close/ }).click()

    // @-file with the correct line range shows up in the chat view and it opens on click
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })
    await contextCell.hover()
    await contextCell.click()
    const chatContext = chatPanelFrame.locator('details').last()
    await chatContext.getByRole('link', { name: 'buzz.ts:1-15' }).hover()
    await chatContext.getByRole('link', { name: 'buzz.ts:1-15' }).click()
    const previewTab = page.getByRole('tab', { name: /buzz.ts, preview, Editor Group/ })
    await previewTab.hover()
    await expect(previewTab).toBeVisible()
})

test.extend<ExpectedEvents>({
    expectedEvents: ['CodyVSCodeExtension:addChatContext:clicked'],
    expectedV2Events: ['cody.addChatContext:clicked'],
})('add selected code as @-mention with "Cody Chat: Add context"', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the buzz.ts file to highlight line 2-13 in the editor
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).click()
    await page.getByText('2', { exact: true }).click()
    await page.getByText('13').click({
        modifiers: ['Shift'],
    })

    // Open the Command Palette and run the "Cody Chat: Add context" command
    const metaKey = getMetaKeyByOS()
    await page.keyboard.press(`${metaKey}+Shift+P`)
    const commandPaletteInputBox = page.getByPlaceholder('Type the name of a command to run.')
    await expect(commandPaletteInputBox).toBeVisible()
    await commandPaletteInputBox.fill('>New Chat with Selection')
    await page.locator('a').filter({ hasText: 'New Chat with Selection' }).click()

    // Verify the chat input has the selected code as an @-mention item
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    await expect(chatInput).toHaveText('@buzz.ts:2-13 ')

    // Repeat the above steps to add another code selection as an @-mention item.
    // The chat input should have the new code selections appended as @-mention items
    // instead of replacing the existing one or adding to a new chat.
    await page.getByRole('tab', { name: 'buzz.ts' }).click()
    await page.locator('div[class*="line-numbers"]').getByText('4', { exact: true }).click()
    await page.getByText('6', { exact: true }).click({ modifiers: ['Shift'] })
    await page.keyboard.press(`${metaKey}+Shift+P`)
    await expect(commandPaletteInputBox).toBeVisible()
    await commandPaletteInputBox.fill('>Add Selection to Cody Chat')
    await page.locator('a').filter({ hasText: 'Add Selection to Cody Chat' }).click()
    await expect(chatInput).toHaveText('@buzz.ts:2-13 @buzz.ts:4-6 ')
})

async function openMentionsForProvider(
    frame: FrameLocator,
    chatInput: Locator,
    provider: string
): Promise<void> {
    await chatInput.fill('@')
    await frame.getByRole('option', { name: provider }).click()
}
