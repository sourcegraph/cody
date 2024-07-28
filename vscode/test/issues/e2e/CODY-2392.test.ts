// CTX(linear-issue): https://linear.app/sourcegraph/issue/CODY-2392

import { expect } from '@playwright/test'
import { test } from '.'
import {
    chatMessageRows,
    createEmptyChatPanel,
    disableNotifications,
    focusSidebar,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
} from '../../e2e/common'
import {
    type ExpectedEvents,
    type ExpectedV2Events,
    type TestConfiguration,
    executeCommandInPalette,
} from '../../e2e/helpers'

test.extend<TestConfiguration & ExpectedEvents & ExpectedV2Events>({
    expectedEvents: [],
    expectedV2Events: [],
    preAuthenticate: true,
})('@issue [CODY-2392](https://linear.app/sourcegraph/issue/CODY-2392)', async ({ page }) => {
    await disableNotifications(page)

    //open a file
    await openFileInEditorTab(page, 'buzz.ts')
    await focusSidebar(page)
    const [chatPanel, lastChatInput, firstChatInput, chatInputs] = await createEmptyChatPanel(page)
    await firstChatInput.fill('show me a code snippet')
    await firstChatInput.press('Enter')

    // wait for assistant response
    const messageRows = chatMessageRows(chatPanel)
    const assistantRow = messageRows.nth(1)
    await expect(assistantRow).toContainText('Here is a code snippet:')

    // we now start editing the original message
    await firstChatInput.click()
    //now write some text
    await firstChatInput.fill('I want to include some context')
    await selectLineRangeInEditorTab(page, 1, 10)
    await executeCommandInPalette(page, 'Cody: Add Selection to Cody Chat')

    // we now expect the first input to contain the selected context
    // the last input should still be empty
    const lastChatInputText = await lastChatInput.textContent()
    await expect(lastChatInput).toBeEmpty()
    await expect(firstChatInput).toContainText('@buzz.ts:1-10')
})
