import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { newChat, test, assertEvents } from './helpers'
import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

// list of events we expect this test to log, add to this list as needed
const expectedEvents = [
    'CodyVSCodeExtension:auth:clickOtherSignInOptions',
    'CodyVSCodeExtension:login:clicked',
    'CodyVSCodeExtension:auth:selectSigninMenu',
    'CodyVSCodeExtension:auth:fromToken',
    'CodyVSCodeExtension:Auth:connected',
    'CodyVSCodeExtension:useEnhancedContextToggler:clicked',
]

test.beforeEach(() => {
    void resetLoggedEvents()
})

test('enhanced context selector is keyboard accessible', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    const chatFrame = await newChat(page)
    const contextSettingsButton = chatFrame.getByTitle('Configure Enhanced Context')
    await contextSettingsButton.focus()

    await page.keyboard.press('Space')
    // Opening the enhanced context settings should focus the checkbox for toggling it.
    const enhancedContextCheckbox = chatFrame.locator('#enhanced-context-checkbox')
    await expect(enhancedContextCheckbox.and(page.locator(':focus'))).toBeVisible()

    // Enhanced context should be enabled by default.
    await expect(enhancedContextCheckbox).toBeChecked()
    await page.keyboard.press('Space')
    // The keyboard should toggle the checkbox, but not dismiss the popup.
    await expect(enhancedContextCheckbox).not.toBeChecked()
    await expect(enhancedContextCheckbox).toBeVisible()

    // The popup should be dismiss-able with the keyboard.
    await page.keyboard.press('Escape')
    // Closing the enhanced context settings should close the dialog...
    await expect(enhancedContextCheckbox).not.toBeVisible()
    // ... and focus the button which re-opens it.
    await expect(contextSettingsButton.and(page.locator(':focus'))).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    await assertEvents(loggedEvents, expectedEvents)
})
