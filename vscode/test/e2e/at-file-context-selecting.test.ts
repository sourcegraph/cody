import path from 'path'

import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

// Creating new chats is slow, and setup is slow, so we collapse all these into one test

test('@-file empty state', async ({ page, sidebar, workspaceDirectory }) => {
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    const chatInput = chatPanelFrame.getByRole('textbox', { name: 'Chat message' })
    await chatInput.fill('@')
    await expect(
        chatPanelFrame.getByRole('heading', { name: 'Search for a file to include, or type # to search symbols..' })
    ).toBeVisible()

    // No results
    await chatInput.fill('@definitelydoesntexist')
    await expect(chatPanelFrame.getByRole('heading', { name: 'No matching files found' })).toBeVisible()

    // Clear the input so the next test doesn't detect the same text already visible from the previous
    // check (otherwise the test can pass even without the filter working).
    await chatInput.clear()

    // We should only match the relative visible path, not parts of the full path outside of the workspace.
    // Eg. searching for "source" should not find all files if the project is inside `C:\Source`.
    //
    // For the test, fixtures is a segment of the workspace dir, but not the relative path.
    expect(workspaceDirectory.split(path.sep)).toContainEqual('fixtures')
    await chatInput.fill('@fixtures')
    await expect(chatPanelFrame.getByRole('heading', { name: 'No matching files found' })).toBeVisible()

    // Includes dotfiles after just "."
    await chatInput.fill('@.')
    await expect(chatPanelFrame.getByRole('button', { name: '.mydotfile' })).toBeVisible()

    // Symbol empty state
    await chatInput.fill('@#')
    await expect(chatPanelFrame.getByRole('heading', { name: 'Search for a symbol to include..' })).toBeVisible()

    // Forward slashes
    await chatInput.fill('@lib/batches/env')
    await expect(
        chatPanelFrame.getByRole('button', { name: withPlatformSlashes('lib/batches/env/var.go') })
    ).toBeVisible()

    // Backslashes
    if (path.sep === path.win32.sep) {
        await chatInput.fill('@lib\\batches\\env')
        await expect(
            chatPanelFrame.getByRole('button', { name: withPlatformSlashes('lib/batches/env/var.go') })
        ).toBeVisible()
    }

    // Searching and clicking
    await chatInput.fill('Explain @mj')
    await chatPanelFrame.getByRole('button', { name: 'Main.java' }).click()
    await expect(chatInput).toHaveValue('Explain @Main.java ')
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(chatPanelFrame.getByText('Explain @Main.java')).toBeVisible()

    // Keyboard nav
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
        withPlatformSlashes('Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go ')
    )

    // Send the message and check it was included
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(
        chatPanelFrame.getByText(
            withPlatformSlashes('Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go')
        )
    ).toBeVisible()

    // Also ensure we have the right number of files in the context.
    await expect(chatPanelFrame.getByText('Context: 2 files')).toBeVisible()

    // Check pressing tab after typing a complete filename.
    // https://github.com/sourcegraph/cody/issues/2200
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.type('@Main.java', { delay: 50 })
    await chatInput.press('Tab')
    await expect(chatInput).toHaveValue('@Main.java ')

    // Verify that we can open a file from the context list.
    // The first search above was for Main.java and the context had only a single file.
    // Expand that group and click the filename and ensure it opens a new editor.
    await chatPanelFrame.getByText('Context: 1 file').click()
    const mainJavaFullPath = path.join(workspaceDirectory, 'Main.java')
    await chatPanelFrame.getByText(`@${mainJavaFullPath}`).click()
    // Expect an editor tab for Main.java
    await expect(page.locator('div[role="tab"][data-resource-name="Main.java"]')).toBeVisible()
})

function withPlatformSlashes(input: string) {
    return input.replaceAll(path.posix.sep, path.sep)
}
