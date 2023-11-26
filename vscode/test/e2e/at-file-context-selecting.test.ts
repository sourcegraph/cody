import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('@-file context mentioning in chat', async ({ page, sidebar }) => {
    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: 'Toggle Do Not Disturb Mode' }).click()

	await sidebarSignin(page, sidebar)

	// TODO(toolmantim): fix me
	await page.getByPlaceholder('Message (type @ to include files)').type('@')
	await expect(
		page.getByText('Search for a file to include, or type # to search symbols..')
	).toBeVisible()

	// TODO(toolmantim): fix me
	await page.getByPlaceholder('Message (type @ to include files)').type('@atfiletestts')
	await expect(
		page.getByText('Search for a file to include...')
	).toBeVisible()

	// TODO(toolmantim): up down keyboard
	// TODO(toolmantim): hit enter key
	// TODO(toolmantim): submit?
})
