import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

// Creating new chats is slow, and setup is slow, so we collapse all these into one test

test('@-file empty state', async ({ page, sidebar }) => {
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

    // Includes dotfiles after just "."
    await chatInput.fill('@.')
    await expect(chatPanelFrame.getByRole('button', { name: '.mydotfile' })).toBeVisible()

    // Symbol empty state
    await chatInput.fill('@#')
    await expect(chatPanelFrame.getByRole('heading', { name: 'Search for a symbol to include..' })).toBeVisible()

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
    await expect(chatInput).toHaveValue('Explain @lib/batches/env/var.go ')
    await chatInput.type('and @vgo', { delay: 50 }) // without this delay the following Enter submits the form instead of selecting
    await chatInput.press('ArrowDown') // second item
    await chatInput.press('ArrowDown') // wraps back to first item
    await chatInput.press('ArrowDown') // second item again
    await chatInput.press('Enter')
    await expect(chatInput).toHaveValue(
        'Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go '
    )

    // Send the message and check it was included
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(
        chatPanelFrame.getByText('Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go')
    ).toBeVisible()
})
