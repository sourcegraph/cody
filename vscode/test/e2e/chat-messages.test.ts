import { promises as fs } from 'node:fs'
import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { isWindows } from '@sourcegraph/cody-shared'
import { chatMessageRows, createEmptyChatPanel, sidebarExplorer, sidebarSignin } from './common'
import { executeCommandInPalette, getTmpLogFile, test } from './helpers'

test.use({
    permissions: ['clipboard-read', 'clipboard-write'],
    extraWorkspaceSettings: {
        'cody.debug.verbose': true,
    },
})

test('chat assistant response code buttons', async ({ page, nap, sidebar }, testInfo) => {
    await sidebarSignin(page, sidebar)

    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'type.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'type.ts' }).hover()

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
    // Place the cursor on some text in the document
    await page.getByText('appleName').click()
    await page.keyboard.press(isWindows() ? 'Control+V' : 'Meta+V')

    const codeToPaste =
        'def fib(n):\n  if n < 0:\n    return n\n  else:\n    return fib(n-1) + fib(n-2)\n'
    const consoleLogMessage = await consoleLogPromise
    expect(await consoleLogMessage.args()[1].jsonValue()).toBe(codeToPaste)

    await executeCommandInPalette(page, 'cody.command.logCharacterCounters')
    // Wait for the logCharacterCounters command to update the log file.
    await nap()
    const outputChannelWithPaste = await fs.readFile(getTmpLogFile(testInfo.title), 'utf-8')

    // We expect the pasted code to be categorized as cody_chat and
    // the relevant inserted characters counter to be incremented appropriately.
    expect(outputChannelWithPaste).toContain(`"cody_chat_inserted": ${codeToPaste.length}`)
    expect(outputChannelWithPaste).toContain('"cody_chat": 1')

    await actionsDropdown.click()
    await executeCommandInPalette(page, 'cody.command.insertCodeToCursor')
    await nap()
    await executeCommandInPalette(page, 'cody.command.logCharacterCounters')
    // Wait for the logCharacterCounters command to update the log file.
    await nap()

    // Static value hardcoded for testing because I did not find a way to
    // reliably access the native OS-dropdown used for the insert code button.
    // Currently defined in: vscode/src/chat/chat-view/ChatsController.ts
    const codeToInsert = 'cody.command.insertCodeToCursor:cody_testing'
    const outputChannelWithInsert = await fs.readFile(getTmpLogFile(testInfo.title), 'utf-8')

    // We expect the inserted code to be categorized as cody_chat and
    // the relevant inserted characters counter to be incremented appropriately.
    expect(outputChannelWithInsert).toContain(
        `"cody_chat_inserted": ${codeToPaste.length + codeToInsert.length}`
    )
    expect(outputChannelWithInsert).toContain('"cody_chat": 2')

    const copyClickedEvent = mockServer.loggedV2Events.find(
        event => event.testId === 'cody.copyButton:clicked'
    )
    const insertClickedEvent = mockServer.loggedV2Events.find(
        event => event.testId === 'cody.insertButton:clicked'
    )
    const chatEventsParameters = {
        copyClickedEvent: copyClickedEvent?.parameters,
        insertClickedEvent: insertClickedEvent?.parameters,
    }
    // We expect events being logged for the copy and insert button clicks.
    expect(JSON.stringify(chatEventsParameters, null, 2)).toMatchSnapshot()
})
