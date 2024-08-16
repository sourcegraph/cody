import { expect } from '@playwright/test'
import { chatMessageRows, createEmptyChatPanel, sidebarSignin } from './common'
import { test } from './helpers'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('chat assistant response code buttons', async ({ page, sidebar, context, contextOptions }) => {
    await sidebarSignin(page, sidebar)
    const [chatPanel, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')

    const messageRows = chatMessageRows(chatPanel)
    const assistantRow = messageRows.nth(1)
    await expect(assistantRow).toContainText('Hello! Here is a code snippet:')
    await expect(assistantRow).toContainText('def fib(n):')

    const copyButton = assistantRow.getByRole('button', { name: 'Copy' })
    const smartApplyButton = assistantRow.getByRole('button', { name: 'Apply' })
    const actionsDropdown = assistantRow.getByRole('button', { name: 'More Actions' })

    expect(await copyButton.count()).toBe(1)
    await expect(copyButton).toBeVisible()
    await expect(smartApplyButton).toBeVisible()
    await expect(actionsDropdown).toBeVisible()

    // When using Playwright for VS Code tests, the clipboard-read and clipboard-write permissions
    // don't work, and attempting to read the clipboard from Playwright throws a DOMException. So,
    // use this workaround instead.
    const consoleLogPromise = page.waitForEvent('console', {
        predicate: msg => msg.text().includes('Code: Copy to Clipboard'),
        timeout: 5000,
    })
    await copyButton.click()
    const consoleLogMessage = await consoleLogPromise
    expect(await consoleLogMessage.args()[1].jsonValue()).toBe(
        'def fib(n):\n  if n < 0:\n    return n\n  else:\n    return fib(n-1) + fib(n-2)\n'
    )
})
