import { isWindows } from '@sourcegraph/cody-shared'
import { expect } from 'playwright/test'
import * as mockServer from '../fixtures/mock-server'
import {
    atMentionMenuMessage,
    chatInputMentions,
    createEmptyChatPanel,
    expectContextCellCounts,
    focusChatInputAtEnd,
    getContextCell,
    mentionMenu,
    mentionMenuItems,
    openContextCell,
    openFileInEditorTab,
    openMentionsForProvider,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    executeCommandInPalette,
    mockEnterpriseRepoIdMapping,
    test,
    withPlatformSlashes,
} from './helpers'

// See chat-atFile.test.md for the expected behavior for this feature.
//
// NOTE: Creating new chats is slow, and setup is slow, so collapse these into fewer tests.

test
    .extend<ExpectedV2Events>({
        expectedV2Events: [
            'cody.extension:installed',
            'cody.auth.login:firstEver',
            'cody.auth.login.token:clicked',
            'cody.auth:connected',
            'cody.chat-question:submitted',
            'cody.chat-question:executed',
            'cody.chatResponse:noCode',
        ],
    })
    .extend<DotcomUrlOverride>({
        // To exercise the "current directory" filename filtering without a git repository
        // for the workspace, simulate dotcom.
        dotcomUrl: mockServer.SERVER_URL,
    })('@-mention file in chat', async ({ page, sidebar, workspaceDirectory, server }) => {
    mockEnterpriseRepoIdMapping(server)

    // This test requires that the window be focused in the OS window manager because it deals with
    // focus.
    await page.bringToFront()

    await sidebarSignin(page, sidebar)

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    await chatInput.dblclick()
    await chatInput.focus()
    await page.keyboard.type('@')
    await expect(mentionMenu(chatPanelFrame).getByRole('option', { selected: true })).toHaveText('Files')
    await page.keyboard.press('Backspace')

    // No results
    await chatInput.fill('@definitelydoesntexist')
    await expect(atMentionMenuMessage(chatPanelFrame, 'No files found')).toBeVisible()

    // Clear the input so the next test doesn't detect the same text already visible from the previous
    // check (otherwise the test can pass even without the filter working).
    await chatInput.clear()

    // We should only match the relative visible path, not parts of the full path outside of the workspace.
    // Eg. searching for "source" should not find all files if the project is inside `C:\Source`.
    // Instead it should find Current Repository item.
    await expect(workspaceDirectory).toContain('fixtures')
    await chatInput.fill('@fixtures') // fixture is in the test project folder name, but not in the relative paths.
    await expect(mentionMenuItems(chatPanelFrame)).toHaveText([/^Current Repository/])

    // Includes dotfiles after just "."
    await chatInput.fill('@.')
    await expect(chatPanelFrame.getByRole('option', { name: '.mydotfile' })).toBeVisible()

    // Forward slashes
    await chatInput.fill('@lib/batches/env')
    await expect(
        chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go') })
    ).toBeVisible()

    // Backslashes
    if (isWindows()) {
        await chatInput.fill('@lib\\batches\\env')
        await expect(
            chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go') })
        ).toBeVisible()
    }

    // Space before @ is required unless it's at position 0
    await chatInput.fill('Explain@mj')
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).not.toBeVisible()
    await chatInput.fill('')
    await chatInput.pressSequentially('@mj', { delay: 350 })
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).toBeVisible()
    await chatInput.fill('clear')

    // Searching and clicking
    await chatInput.fill('Explain @mj')
    await chatPanelFrame.getByRole('option', { name: 'Main.java' }).click()
    await expect(chatInput).toHaveText('Explain Main.java ')
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(chatPanelFrame.getByText('Explain Main.java')).toBeVisible()
    const contextCell = getContextCell(chatPanelFrame)
    await expect(contextCell).toHaveCount(1)
    await expect(chatInput).not.toHaveText('Explain Main.java ')
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).not.toBeVisible()

    // Keyboard nav through context files
    await chatInput.fill('Explain @var.go')
    await expect(
        chatPanelFrame.getByRole('option', { name: withPlatformSlashes('var.go lib/batches/env') })
    ).toBeVisible()
    await chatInput.press('Tab')
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText(withPlatformSlashes('Explain var.go '))
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
    await expect(chatInput).toHaveText(withPlatformSlashes('Explain var.go and visualize.go '))
    await expect(chatInputMentions(chatInput)).toHaveText(['var.go', 'visualize.go'])

    // Send the message and check it was included
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(
        chatPanelFrame.getByText(withPlatformSlashes('Explain var.go and visualize.go'))
    ).toBeVisible()

    // Ensure explicitly @-included context is shown.
    await expect(contextCell).toHaveCount(2)

    // Check pressing tab after typing a complete filename.
    // https://github.com/sourcegraph/cody/issues/2200
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.pressSequentially('@Main.java', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'Main.java' })).toBeVisible()
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText('Main.java ')
    await expect(chatInputMentions(chatInput)).toHaveText(['Main.java'])

    // Check pressing tab after typing a partial filename but where that complete
    // filename already exists earlier in the input.
    // https://github.com/sourcegraph/cody/issues/2243
    await chatInput.pressSequentially('and @Main.ja', { delay: 10 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveText('Main.java and Main.java ')
    await expect(chatInputMentions(chatInput)).toHaveText(['Main.java', 'Main.java'])

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
    await expect(chatInput).toHaveText('Explain the Main.java file')
    // Confirm the cursor is at the end of the newly added file name with space
    await page.keyboard.press('!')
    await page.keyboard.press('Delete')
    await expect(chatInput).toHaveText('Explain the Main.java !file')

    //  "ArrowLeft" / "ArrowRight" keys alter the query input for @-mentions.
    const noMatches = atMentionMenuMessage(chatPanelFrame, 'No files found')
    await chatInput.pressSequentially(' @abcdefg')
    await expect(chatInput).toHaveText('Explain the Main.java ! @abcdefgfile')
    await noMatches.hover()
    await expect(noMatches).toBeVisible()
    await chatInput.press('ArrowLeft')
    await expect(noMatches).toBeVisible()
    await chatInput.press('ArrowRight')
    await expect(noMatches).toBeVisible()
    await chatInput.press('$')
    await expect(chatInput).toHaveText('Explain the Main.java ! @abcdefg$file')
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

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.editChatButton:clicked',
        'cody.chatResponse:noCode',
    ],
})('editing a chat message with @-mention', async ({ page, sidebar, server }) => {
    // Enable the NoDefaultRepoChip feature flag to prevent workspace context
    // Set this before signin to ensure it's available when the extension starts
    server.setFeatureFlag('no-default-repo-chip', true)

    await sidebarSignin(page, sidebar)

    const [chatPanelFrame, , firstChatInput] = await createEmptyChatPanel(page)

    // Send a message with an @-mention.
    await firstChatInput.fill('Explain ')
    await firstChatInput.pressSequentially('@mj', { delay: 350 })
    await chatPanelFrame.getByRole('option', { name: 'Main.java' }).click()
    await expect(firstChatInput).toHaveText('Explain Main.java ')
    await firstChatInput.press('Enter')
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })

    // Edit the just-sent message and resend it. Confirm it is sent with the right context items.
    await expect(firstChatInput).toHaveText('Explain Main.java ')
    await firstChatInput.press('Meta+Enter')
    await expectContextCellCounts(contextCell, { files: 1 })

    // Edit it again, add a new @-mention, and resend.
    await expect(firstChatInput).toHaveText('Explain Main.java ')
    await focusChatInputAtEnd(firstChatInput)
    await firstChatInput.pressSequentially('and @index.ht')
    await chatPanelFrame.getByRole('option', { name: 'index.html' }).click()
    await expect(firstChatInput).toHaveText('Explain Main.java and index.html')
    await firstChatInput.press('Enter')
    await expect(firstChatInput).toHaveText('Explain Main.java and index.html')
    await expect(chatInputMentions(firstChatInput)).toHaveText(['Main.java', 'index.html'])
    await expectContextCellCounts(contextCell, { files: 2 })
})

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
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
    await expect(chatInput).toHaveText('buzz.ts:2-4 ')
    // Submit the message
    await chatInput.press('Enter')

    // @-file range with the correct line range shows up in the chat view and it opens on click
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })
    await openContextCell(contextCell)
    const chatContext = getContextCell(chatPanelFrame).last()
    await chatContext.getByRole('button', { name: 'buzz.ts:2-4' }).hover()
    await chatContext.getByRole('button', { name: 'buzz.ts:2-4' }).click()
    const previewTab = page.getByRole('tab', { name: /buzz.ts, preview, Editor Group/ })
    await previewTab.hover()
    await expect(previewTab).toBeVisible()
})

// NOTE: @symbols does not require double tabbing to select an option.
test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('@-mention symbol in chat', async ({ page, nap, sidebar, server }) => {
    mockEnterpriseRepoIdMapping(server)

    server.setFeatureFlag('no-default-repo-chip', true)
    await sidebarSignin(page, sidebar)

    // Open the buzz.ts file so that VS Code starts to populate symbols.
    await openFileInEditorTab(page, 'buzz.ts')

    // Open chat.
    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    // Wait for the tsserver to become ready: when sync icon disappears
    const langServerLoadingState = 'Editor Language Status: Loading'
    await expect(page.getByRole('button', { name: langServerLoadingState })).not.toBeVisible()

    // Go back to the Cody chat tab
    await nap()
    await page.getByRole('tab', { name: 'New Chat' }).click()

    // Symbol empty state shows tooltip to search for a symbol
    await openMentionsForProvider(chatPanelFrame, chatInput, 'Symbols')

    // Symbol empty symbol results updates tooltip title to show no symbols found
    await chatInput.pressSequentially('xx', { delay: 10 })
    await expect(atMentionMenuMessage(chatPanelFrame, /^No symbols found/)).toBeVisible()
    await chatInput.press('Backspace')
    await chatInput.press('Backspace')
    await chatInput.press('Backspace')

    // Clicking on a file in the selector should autocomplete the file in chat input with added space
    await openMentionsForProvider(chatPanelFrame, chatInput, 'Symbols')
    await chatInput.pressSequentially('fizzb', { delay: 10 })
    await expect(chatPanelFrame.getByRole('option', { name: 'fizzbuzz()' })).toBeVisible()
    await chatPanelFrame.getByRole('option', { name: 'fizzbuzz()' }).click()
    await expect(chatInput).toHaveText(/buzz.ts fizzbuzz\(\) /)
    await expect(chatInputMentions(chatInput)).toContainText(['buzz.ts', 'fizzbuzz()'])

    // Submit the message
    await chatInput.press('Enter')

    // Close file.
    const pinnedTab = page.getByRole('tab', { name: 'buzz.ts', exact: true })
    await pinnedTab.getByRole('button', { name: /^Close/ }).click({ force: true })

    // @-file with the correct line range shows up in the chat view and it opens on click
    const contextCell = getContextCell(chatPanelFrame)
    await expectContextCellCounts(contextCell, { files: 1 })
    await openContextCell(contextCell)
    const chatContext = getContextCell(chatPanelFrame).last()
    await chatContext.getByRole('button', { name: 'buzz.ts:1-15' }).hover()
    await chatContext.getByRole('button', { name: 'buzz.ts:1-15' }).click()
    const previewTab = page.getByRole('tab', { name: /buzz.ts, preview, Editor Group/ })
    await previewTab.hover()
    await expect(previewTab).toBeVisible()
})

test.extend<ExpectedV2Events>({
    expectedV2Events: ['cody.addChatContext:clicked'],
})('Add Selection to Cody Chat', async ({ page, sidebar, server }) => {
    mockEnterpriseRepoIdMapping(server)

    // Enable the NoDefaultRepoChip feature flag to prevent workspace context
    // Set this before signin to ensure it's available when the extension starts
    server.setFeatureFlag('no-default-repo-chip', true)

    await sidebarSignin(page, sidebar)

    await openFileInEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 2, 5)
    const [, lastChatInput] = await createEmptyChatPanel(page)
    await expect(chatInputMentions(lastChatInput)).toHaveText(['buzz.ts', 'buzz.ts:2-5'], {
        timeout: 3_000,
    })

    await lastChatInput.press('x')
    await selectLineRangeInEditorTab(page, 7, 10)
    await executeCommandInPalette(page, 'Cody: Add Selection to Cody Chat')
    await expect(chatInputMentions(lastChatInput)).toHaveText(['buzz.ts', 'buzz.ts:2-5', 'buzz.ts:7-10'])
})
