import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('@-file empty state', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await sidebar.getByRole('textbox').type('@')
    await expect(
        sidebar.getByRole('heading', { name: 'Search for a file to include, or type # to search symbols..' })
    ).toBeVisible()
})

test('@-file fuzzy matching and clicking', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    const chatInput = sidebar.getByRole('textbox')

    // Searching and clicking
    await chatInput.fill('Explain @mj')
    await sidebar.getByRole('button', { name: 'Main.java' }).click()
    await expect(chatInput).toHaveValue('Explain @Main.java ')

    // Send the message and check it was included
    await chatInput.press('Enter')
    await expect(chatInput).toBeEmpty()
    await expect(sidebar.getByText('Explain @Main.java')).toBeVisible()

    // click the file link in the transcript and check it opens
    await sidebar.getByText('@Main.java').click()
    await expect(
        page.locator('[id="workbench\\.parts\\.editor"]').getByRole('tab').getByText('Main.java')
    ).toBeVisible()
})

test('@-file fuzzy matching and keyboard navigating', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    const chatInput = sidebar.getByRole('textbox')
    await chatInput.pressSequentially('Explain @vgo', { delay: 50 }) // without this delay the following Enter submits the form instead of selecting

    // Hitting Enter on the default selection (first item)
    await chatInput.press('Enter')
    await expect(chatInput).toHaveValue('Explain @lib/batches/env/var.go ')

    // Navigating with the arrow keys and looping around
    await chatInput.pressSequentially('and @vgo', { delay: 50 }) // without this delay the following Enter submits the form instead of selecting
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
        sidebar.getByText('Explain @lib/batches/env/var.go and @lib/codeintel/tools/lsif-visualize/visualize.go')
    ).toBeVisible()

    // click a file link in the transcript and check it opens
    await sidebar.getByText('@lib/batches/env/var.go').click()
    await expect(page.locator('[id="workbench\\.parts\\.editor"]').getByRole('tab').getByText('var.go')).toBeVisible()
})

test('@-file no-matches state', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await sidebar.getByRole('textbox').fill('@definitelydoesntexist')
    await expect(sidebar.getByRole('heading', { name: 'No matching files found' })).toBeVisible()
})

test('@-file symbol empty state', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await sidebar.getByRole('textbox').fill('@#')
    await expect(sidebar.getByRole('heading', { name: 'Search for a symbol to include..' })).toBeVisible()
})
