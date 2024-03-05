import { expect } from '@playwright/test'

import { isWindows } from '@sourcegraph/cody-shared'

import { sidebarSignin } from './common'
import { type ExpectedEvents, getMetaKeyByOS, test, withPlatformSlashes } from './helpers'

/**
 * Tests for @-file & @#-symbol in chat
 * See chat-atFile.test.md for the expected behavior for this feature.
 *
 * NOTE: Creating new chats is slow, and setup is slow, so we collapse all these into one test
 */
test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:at-mention:executed',
        'CodyVSCodeExtension:at-mention:file:executed',
        'CodyVSCodeExtension:at-mention:symbol:executed',
    ],
})('@-file & @#-symbol in chat view', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    const chatInput = chatPanelFrame.getByRole('textbox', { name: 'Chat message' })
    await chatInput.click()
    await page.keyboard.type('@')
    await expect(
        chatPanelFrame.getByRole('heading', {
            name: 'Search for a file to include, or type # to search symbols...',
        })
    ).toBeVisible()

    // No results
    await chatInput.click()
    await page.keyboard.type('@definitelydoesntexist')
    await expect(chatPanelFrame.getByRole('heading', { name: 'No matching files found' })).toBeVisible()

    // Clear the input so the next test doesn't detect the same text already visible from the previous
    // check (otherwise the test can pass even without the filter working).
    await chatInput.clear()

    // We should only match the relative visible path, not parts of the full path outside of the workspace.
    // Eg. searching for "source" should not find all files if the project is inside `C:\Source`.
    // TODO(dantup): After https://github.com/sourcegraph/cody/pull/2235 lands, add workspacedirectory to the test
    //   and assert that it contains `fixtures` to ensure this check isn't passing because the fixture folder no
    //   longer matches.
    await page.keyboard.type('@fixtures') // fixture is in the test project folder name, but in the relative paths.
    await expect(chatPanelFrame.getByRole('heading', { name: 'No matching files found' })).toBeVisible()

    // Includes dotfiles after just "."
    await chatInput.fill('@.')
    await expect(chatPanelFrame.getByRole('button', { name: '.mydotfile' })).toBeVisible()

    // Symbol empty state
    await chatInput.fill('@#')
    await expect(
        chatPanelFrame.getByRole('heading', { name: 'Search for a symbol to include..' })
    ).toBeVisible()

    // Forward slashes
    await chatInput.fill('@lib/batches/env')
    await expect(
        chatPanelFrame.getByRole('button', { name: withPlatformSlashes('lib/batches/env/var.go') })
    ).toBeVisible()

    // Backslashes
    if (isWindows()) {
        await chatInput.fill('@lib\\batches\\env')
        await expect(
            chatPanelFrame.getByRole('button', { name: withPlatformSlashes('lib/batches/env/var.go') })
        ).toBeVisible()
    }

    // Space before @ is required unless it's at position 0
    await chatInput.fill('Explain@mj')
    await expect(chatPanelFrame.getByRole('button', { name: 'Main.java' })).not.toBeVisible()
    await chatInput.fill('@mj')
    await expect(chatPanelFrame.getByRole('button', { name: 'Main.java' })).toBeVisible()
    await chatInput.fill('clear')

    // Searching and clicking
    await chatInput.fill('Explain @mj')
    await chatPanelFrame.getByRole('button', { name: 'Main.java' }).click()
    await expect(chatInput).toHaveValue('Explain @Main.java ')
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(chatPanelFrame.getByText('Explain @Main.java')).toBeVisible()
    await expect(chatPanelFrame.getByText(/^✨ Context:/)).toHaveCount(1)
    await expect(chatInput).not.toHaveValue('Explain @Main.java ')
    await expect(chatPanelFrame.getByRole('button', { name: 'Main.java' })).not.toBeVisible()

    // Use history to re-send a message with context files
    await page.waitForTimeout(50)
    await chatInput.press('ArrowUp', { delay: 50 })
    await expect(chatInput).toHaveValue('Explain @Main.java ')
    await chatInput.press('Meta+Enter')
    await expect(chatPanelFrame.getByText(/^✨ Context:/)).toHaveCount(2)

    // Keyboard nav through context files
    await chatInput.type('Explain @vgo', { delay: 50 }) // without this delay the following Enter submits the form instead of selecting
    await chatInput.press('Enter')
    await expect(chatInput).toHaveValue(withPlatformSlashes('Explain @lib/batches/env/var.go '))
    await chatInput.type('and @vgo', { delay: 50 }) // without this delay the following Enter submits the form instead of selecting
    await chatInput.press('ArrowDown') // second item (visualize.go)
    await chatInput.press('ArrowDown') // third item (.vscode/settings.json)
    await chatInput.press('ArrowDown') // wraps back to first item
    await chatInput.press('ArrowDown') // second item again
    await chatInput.press('Enter')
    await expect(chatInput).toHaveValue(
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
    await expect(chatPanelFrame.getByText(/^✨ Context:/)).toHaveCount(3)

    // Check pressing tab after typing a complete filename.
    // https://github.com/sourcegraph/cody/issues/2200
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.type('@Main.java', { delay: 50 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveValue('@Main.java ')

    // Check pressing tab after typing a partial filename but where that complete
    // filename already exists earlier in the input.
    // https://github.com/sourcegraph/cody/issues/2243
    await chatInput.type('and @Main.ja', { delay: 50 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveValue('@Main.java and @Main.java ')

    // Support @-file in mid-sentence
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.type('Explain the file', { delay: 50 })
    await chatInput.press('ArrowLeft') // 'Explain the fil|e'
    await chatInput.press('ArrowLeft') // 'Explain the fi|le'
    await chatInput.press('ArrowLeft') // 'Explain the f|ile'
    await chatInput.press('ArrowLeft') // 'Explain the |file'
    await chatInput.press('ArrowLeft') // 'Explain the| file'
    await chatInput.press('Space') // 'Explain the | file'
    await chatInput.type('@Main', { delay: 50 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveValue('Explain the @Main.java file')
    // Confirm the cursor is at the end of the newly added file name with space
    await page.keyboard.type('!')
    await expect(chatInput).toHaveValue('Explain the @Main.java !file')

    //  "ArrowLeft" / "ArrowRight" keys close the selection without altering current input.
    const noMatches = chatPanelFrame.getByRole('heading', { name: 'No matching files found' })
    await chatInput.type(' @abcdefg', { delay: 50 })
    await expect(chatInput).toHaveValue('Explain the @Main.java ! @abcdefgfile')
    await noMatches.hover()
    await expect(noMatches).toBeVisible()
    await chatInput.press('ArrowLeft')
    await expect(noMatches).not.toBeVisible()
    await chatInput.press('ArrowRight')
    await expect(noMatches).not.toBeVisible()
    await chatInput.type('?', { delay: 50 })
    await expect(chatInput).toHaveValue('Explain the @Main.java ! @abcdefg?file')
    await noMatches.hover()
    await expect(noMatches).toBeVisible()
    // Selection close on submit
    await chatInput.press('Enter')
    await expect(noMatches).not.toBeVisible()
    await expect(chatInput).toBeEmpty()

    // Query ends with non-alphanumeric character
    // with no results should not show selector.
    await chatInput.focus()
    await chatInput.fill('@unknown')
    await expect(noMatches).toBeVisible()
    await chatInput.press('?')
    await expect(chatInput).toHaveValue('@unknown?')
    await expect(noMatches).not.toBeVisible()
    await chatInput.press('Backspace')
    await expect(noMatches).toBeVisible()

    const osKey = getMetaKeyByOS()

    // Typing out the whole file path without pressing tab/enter should still include the
    // file as context
    await chatInput.press(`${osKey}+/`) // start a new chat
    await chatInput.fill('@index.htm')
    await chatInput.press('l')
    await expect(chatPanelFrame.getByRole('button', { name: 'index.html' })).toBeVisible()
    await chatInput.press('Space')
    await page.keyboard.type('explain.', { delay: 50 })
    await chatInput.press('Enter')
    await expect(chatPanelFrame.getByText(/^✨ Context:/)).toHaveCount(1)
})

test('@-file with range support', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatPanelFrame.getByRole('textbox', { name: 'Chat message' })

    // Clicking on a file in the selector should autocomplete the file in chat input with added space
    await chatInput.fill('@index.htm')
    await expect(chatPanelFrame.getByRole('button', { name: 'index.html' })).toBeVisible()
    await chatPanelFrame.getByRole('button', { name: 'index.html' }).click()
    await expect(chatInput).toHaveValue('@index.html ')

    // NOTE: Ghost text format: @path/file:line-line (line range)
    // Ghost text shows up when @file is followed by a colon and get updated as the user types
    await chatInput.fill('@index.html:')
    const ghostText0 = 'index.html:line-line (line range)'
    await expect(chatPanelFrame.getByRole('button', { name: ghostText0 })).toBeVisible()

    await chatInput.fill('@index.html:1')
    const ghostText1 = 'index.html:1-line (line range)'
    await expect(chatPanelFrame.getByRole('button', { name: ghostText1 })).toBeVisible()

    await chatInput.fill('@index.html:1-')
    const ghostText2 = 'index.html:1-line (line range)'
    await expect(chatPanelFrame.getByRole('button', { name: ghostText2 })).toBeVisible()

    await chatInput.fill('@index.html:1-5')
    const ghostText3 = 'index.html:1-5 (line range)'
    await expect(chatPanelFrame.getByRole('button', { name: ghostText3 })).toBeVisible()

    // Pressing enter should close the suggestion box and add a whitespace after selection
    await chatInput.press('Enter')
    await expect(chatPanelFrame.getByRole('button', { name: ghostText3 })).not.toBeVisible()
    await expect(chatInput).toHaveValue('@index.html:1-5 ')

    // Submit the message
    await chatInput.press('Enter')

    // @-file with the correct line range shows up in the chat view and it opens on click
    await chatPanelFrame.getByText('✨ Context: 5 lines from 1 file').hover()
    await chatPanelFrame.getByText('✨ Context: 5 lines from 1 file').click()
    await chatPanelFrame.getByRole('link', { name: '@index.html:1-5' }).hover()
    await chatPanelFrame.getByRole('link', { name: '@index.html:1-5' }).click()
    const indexFileTab = page.getByRole('tab', { name: /index.html, preview, Editor Group/ })
    await indexFileTab.hover()
    await expect(indexFileTab).toBeVisible()
})
