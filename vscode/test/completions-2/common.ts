import path from 'path'

import { Frame, Page } from 'playwright'

import { ROOT_PATH } from '@sourcegraph/cody-shared/src/common'

export const sidebarSignin = async (page: Page, sidebar: Frame): Promise<void> => {
    const { SRC_ENDPOINT, SRC_ACCESS_TOKEN } = process.env
    if (!SRC_ENDPOINT || !SRC_ACCESS_TOKEN) {
        throw new Error('Provide SRC_ENDPOINT and SRC_ACCESS_TOKEN to run the evaluation suite')
    }

    await sidebar.getByRole('button', { name: 'Other Sign In Options…' }).click()
    await page.getByRole('option', { name: 'Sign in with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SRC_ENDPOINT)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(SRC_ACCESS_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
}

export const WORKSPACE_PATH = path.resolve(ROOT_PATH, 'vscode/test/completions-2/workspace')
