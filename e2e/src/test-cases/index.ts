import { type ConfigurationUseContext } from '@sourcegraph/cody-shared/src/configuration'

export interface Fact {
    type: 'literal' | 'regex'
    value: string
}

export function literalFacts(...values: string[]): Fact[] {
    return values.map(value => ({ type: 'literal', value }))
}

export function regexpFacts(...regexps: string[]): Fact[] {
    return regexps.map(regexp => ({ type: 'regex', value: regexp }))
}

export interface InteractionTestCase {
    question: string
    facts: Fact[]
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

function initialize(): void {
    /* eslint-disable @typescript-eslint/no-require-imports */
    require('./sourcegraph')
    require('./zoekt')
    require('./codesearchai')
    require('./numpy')
    require('./pytorch')
    require('./embeddings')
    /* eslint-enable @typescript-eslint/no-require-imports */
}

initialize()
