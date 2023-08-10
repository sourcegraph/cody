import { ConfigurationUseContext } from '@sourcegraph/cody-shared/src/configuration'

export interface InteractionTestCase {
    question: string
    facts: string[]
    answerSummary: string
}

export interface TestCase {
    label: string
    codebase: string
    context: ConfigurationUseContext
    transcript: InteractionTestCase[]
    // TODO: Editor state.
}

export const testCases: TestCase[] = []

export function addTestCase(label: string, testCase: Omit<TestCase, 'label'>): void {
    testCases.push({ label, ...testCase })
}

export function initialize(): void {
    /* eslint-disable @typescript-eslint/no-require-imports */
    require('./sourcegraph')
    require('./zoekt')
    require('./codesearchai')
    require('./hf-transformers')
    /* eslint-enable @typescript-eslint/no-require-imports */
}

initialize()
