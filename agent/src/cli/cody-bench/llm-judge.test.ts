import type { Polly } from '@pollyjs/core'
import { ModelProvider, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPollyRecording } from '../../../../vscode/src/testutils/polly'
import { TESTING_CREDENTIALS } from '../../../../vscode/src/testutils/testing-credentials'
import { Llm } from './llm-judge'
import { llmJudgeFixTemplate } from './llm-judge-fix-template'

// Skipped because the shared testing account is getting rate limited. It's OK
// to manually run this test to begin with anyways.
describe.skip('Llm', () => {
    ModelProvider.setProviders(getDotComDefaultModels())
    let polly: Polly | undefined
    beforeAll(() => {
        if (process.env.CODY_RECORDING_MODE !== 'passthrough') {
            polly = startPollyRecording({
                recordingName: 'llm-judge',
            })
        }
    })
    afterAll(async () => {
        await polly?.stop()
    })

    const llm = new Llm({
        srcAccessToken: TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
        srcEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
    })

    it('fix-amazing', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: dedent`export function fixCommandExample(): number {
                return '42';
            }
            `,
                codeAfterFix: dedent`export function fixCommandExample(): number {
                return 42;
            }
            `,
                diagnosticBeforeFix: dedent`Type 'string' is not assignable to type 'number'.ts(2322)`,
                diagnosticsAfterFix: '',
            })
        )

        expect(score.score).toBe('amazing')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)

    it('fix-acceptable', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: dedent`
                    export function readContents(): string {
                        const filepath = '/path/to/file'
                        const text = 42
                        return text
                    }
            `,
                codeAfterFix: dedent`
                export function readContents(): string {
                    const filepath = '/path/to/file'
                    const text = fs.readFileSync(filepath, 'utf8')
                    return text
                }
        `,
                diagnosticBeforeFix: dedent`Type 'string' is not assignable to type 'number'.ts(2322)`,
                diagnosticsAfterFix: `Cannot find name 'fs'.ts(2304) `,
            })
        )
        expect(score.score).toBe('acceptable')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)

    it('fix-bad', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: dedent`import helper from 'helper'
                    export function fixCommandExample(): boolean {
                        return helper('hello');
                    }
            `,
                diagnosticBeforeFix: dedent`Type 'string' is not assignable to type 'number'.ts(2322)`,
                codeAfterFix: dedent`import helper from 'helper'
                    export function fixCommandExample(): boolean {
                        return helper(null); // error: type string is not assignable to type number
                    }
            `,
                diagnosticsAfterFix: '',
            })
        )
        expect(score.score).toBe('bad')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)
})
