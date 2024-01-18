import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('editing follow-up messages in chat view', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })

    // Submit three messages
    await chatInput.fill('One')
    await chatInput.press('Meta+Enter')
    await chatInput.fill('Two')
    await chatInput.press('Meta+Enter')
    await chatInput.fill('Three')
    await chatInput.press('Meta+Enter')

    // Three edit buttons should show up, one for each message submitted
    const editButtons = chatFrame.locator('.codicon-edit')
    await expect(editButtons).toHaveCount(3)

    // Click on the first edit button to get into the editing mode
    await editButtons.nth(0).click()
    await expect(chatFrame.getByText('Editing...')).toBeVisible()

    // Only one close button should be displayed on the message that's being edited
    // All the edit buttons will be invisible during editing,
    // on close, edit buttons should up on each message again
    const closeButtons = chatFrame.getByTitle('cancel edit').locator('i')
    await expect(closeButtons).toHaveCount(1)
    await expect(editButtons).toHaveCount(0)
    await closeButtons.click()
    await expect(chatFrame.locator('.codicon-edit')).toHaveCount(3)

    // click on the second edit button to get into the editing mode again
    // edit the message from "Two" to "Four"
    await chatFrame.locator('.codicon-edit').nth(1).click()
    await expect(chatFrame.getByText('Editing...')).toBeVisible()
    // the original message text should shows up in the text box
    const editTextArea = chatFrame.getByText('Two')
    await editTextArea.click()
    await editTextArea.fill('Four')
    await page.keyboard.press('Meta+Enter')

    // Only two messages are left after the edit (e.g. "One", "Four"),
    // as all the messages after the edited message have be removed
    await expect(chatFrame.locator('.codicon-edit')).toHaveCount(2)
    await expect(chatFrame.getByText('One')).toBeVisible()
    await expect(chatFrame.getByText('Two')).not.toBeVisible()
    await expect(chatFrame.getByText('Three')).not.toBeVisible()
    await expect(chatFrame.getByText('Four')).toBeVisible()
})
