import { execSync } from 'child_process'
import path from 'path'

import { Page } from '@playwright/test'

import { WORKSPACE_PATH } from './common'
import { CURSOR } from './create-test-case'

interface CompletionResult {
    passed: boolean
    iterations: number
}

/**
 * The maximum number of times we should execute a new completion to try to pass the test case
 */
const MAX_ITERATIONS = 1

export const executeCompletion = async (
    page: Page,
    evaluationPath: string,
    iteration = 0
): Promise<CompletionResult> => {
    await page.waitForTimeout(500)
    const currentIteration = iteration + 1

    // Add new line to trigger completion
    await page.keyboard.type(' ')
    await page.getByRole('button', { name: 'Accept (Tab)' }).click()
    await page.keyboard.down('Meta')
    await page.keyboard.press('S')
    await page.keyboard.up('Meta')

    let passed = false
    try {
        execSync(`python ${evaluationPath}`, { cwd: WORKSPACE_PATH, stdio: 'inherit' })
        passed = true
    } catch {
        if (currentIteration < MAX_ITERATIONS) {
            return executeCompletion(page, evaluationPath, currentIteration)
        }
    }

    return { passed, iterations: currentIteration }
}

interface CaseResult extends CompletionResult {
    editSimilarity: number
    exactMatch: number
}

export const evaluateCompletion = async (page: Page, filePath: string, testPath: string): Promise<CaseResult> => {
    const casePath = path.resolve(filePath)
    const evaluationPath = path.resolve(testPath)
    if (!casePath || !evaluationPath) {
        throw new Error(`Could not find valid case file for ${filePath}`)
    }

    // Open file
    await page.locator('[id="workbench\\.parts\\.titlebar"] span').first().click()
    await page.getByPlaceholder(/Search files by name/).fill(casePath)
    await page.getByPlaceholder(/Search files by name/).press('Enter')

    // Remove cursor placeholder
    await page.getByText(CURSOR).click()
    await page.keyboard.press('Delete')
    // Execute completion until pass or fail
    const { passed, iterations } = await executeCompletion(page, evaluationPath)

    return {
        passed,
        iterations,
        editSimilarity: 0,
        exactMatch: 0,
    }
}
