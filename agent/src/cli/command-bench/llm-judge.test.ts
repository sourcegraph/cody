import type { Polly } from '@pollyjs/core'
import { ps } from '@sourcegraph/cody-shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPollyRecording } from '../../../../vscode/src/testutils/polly'
import { TESTING_CREDENTIALS } from '../../../../vscode/src/testutils/testing-credentials'
import { LlmJudge } from './llm-judge'
import { llmJudgeFixTemplate } from './llm-judge-fix-template'

// Skipped because the shared testing account is getting rate limited. It's OK
// to manually run this test to begin with anyways.
describe.skip('LLM-as-judge', () => {
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

    const llm = new LlmJudge({
        srcAccessToken: TESTING_CREDENTIALS.dotcom.token ?? TESTING_CREDENTIALS.dotcom.redactedToken,
        srcEndpoint: TESTING_CREDENTIALS.dotcom.serverEndpoint,
    })

    it('fix-amazing', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: ps`export function fixCommandExample(): number {
                return '42';
            }
            `,
                codeAfterFix: ps`export function fixCommandExample(): number {
                return 42;
            }
            `,
                diagnosticBeforeFix: ps`Type 'string' is not assignable to type 'number'.ts(2322)`,
                diagnosticsAfterFix: ps``,
            })
        )

        expect(score.score).toBe('amazing')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)

    it('fix-acceptable', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: ps`
                    export function readContents(): string {
                        const filepath = '/path/to/file'
                        const text = 42
                        return text
                    }
            `,
                codeAfterFix: ps`
                export function readContents(): string {
                    const filepath = '/path/to/file'
                    const text = fs.readFileSync(filepath, 'utf8')
                    return text
                }
        `,
                diagnosticBeforeFix: ps`Type 'string' is not assignable to type 'number'.ts(2322)`,
                diagnosticsAfterFix: ps`Cannot find name 'fs'.ts(2304) `,
            })
        )
        expect(score.score).toBe('acceptable')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)

    it('fix-bad', async () => {
        const score = await llm.judge(
            llmJudgeFixTemplate({
                codeBeforeFix: ps`import helper from 'helper'
                    export function fixCommandExample(): boolean {
                        return helper('hello');
                    }
            `,
                diagnosticBeforeFix: ps`Type 'string' is not assignable to type 'number'.ts(2322)`,
                codeAfterFix: ps`import helper from 'helper'
                    export function fixCommandExample(): boolean {
                        return helper(null); // error: type string is not assignable to type number
                    }
            `,
                diagnosticsAfterFix: ps``,
            })
        )
        expect(score.score).toBe('bad')
        expect(score.reasoning).toMatchSnapshot()
    }, 20_000)
})

// Unit tests for the new judgeModel functionality
describe('LlmJudge constructor and model configuration', () => {
    const mockOptions = {
        srcAccessToken: 'test-token',
        srcEndpoint: 'https://test.sourcegraph.com',
    }

    it('should use default model when no model parameter provided', () => {
        const judge = new LlmJudge(mockOptions)
        expect((judge as any).model).toBe('anthropic/claude-3-5-sonnet-20240620')
    })

    it('should use provided model parameter', () => {
        const customModel = 'anthropic/claude-3-haiku-20240307'
        const judge = new LlmJudge(mockOptions, customModel)
        expect((judge as any).model).toBe(customModel)
    })

    it('should handle different model formats', () => {
        const models = [
            'anthropic/claude-3-5-sonnet-20240620',
            'anthropic/claude-3-haiku',
            'openai/gpt-4',
            'custom-model',
        ]

        for (const model of models) {
            const judge = new LlmJudge(mockOptions, model)
            expect((judge as any).model).toBe(model)
        }
    })

    it('should maintain backward compatibility with existing constructor usage', () => {
        // This tests that the old way of creating LlmJudge still works
        const judge = new LlmJudge(mockOptions)
        expect(judge).toBeInstanceOf(LlmJudge)
        expect((judge as any).model).toBe('anthropic/claude-3-5-sonnet-20240620')
    })
})
