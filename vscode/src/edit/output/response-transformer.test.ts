import { describe, expect, it } from 'vitest'
import { responseTransformer } from './response-transformer'
import { RESPONSE_TEST_FIXTURES } from './test-fixtures'
import { SMART_APPLY_CUSTOM_PROMPT_TOPICS, SMART_APPLY_MODEL_IDENTIFIERS } from '../prompt/constants'

// Since extractSmartApplyCustomModelResponse is not exported, we'll need to test it through the responseTransformer
describe('Smart Apply Response Extraction', () => {
    const createTask = (intent: string, model: string) => ({
        ...RESPONSE_TEST_FIXTURES.clean.task,
        intent,
        model,
    } as any)

    it('should extract code between smart apply tags for valid input', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>const x = 1;</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        const result = responseTransformer(text, task, true)
        expect(result).toBe('const x = 1;')
    })

    it('should return original text when intent is not smartApply', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>const x = 1;</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('edit', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        const result = responseTransformer(text, task, true)
        expect(result).toBe(text)
    })

    it('should return original text when model is not smart apply model', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>const x = 1;</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', 'gpt-4')

        const result = responseTransformer(text, task, true)
        expect(result).toBe(text)
    })

    it('should return original text when tags are not properly placed', () => {
        const text = `some text <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>const x = 1;</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> more text`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        const result = responseTransformer(text, task, true)
        expect(result).toBe(text)
    })

    it('should handle nested tags and extract outermost content', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>outer <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>inner</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> content</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        const result = responseTransformer(text, task, true)
        expect(result).toBe(`outer <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>inner</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> content`)
    })

    it('should handle empty content between tags', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        const result = responseTransformer(text, task, true)
        expect(result).toBe('')
    })
})

describe('responseTransformer', () => {
    describe.each(Object.entries(RESPONSE_TEST_FIXTURES))(
        'responseTransformer with %s',
        (name, fixture) => {
            it(`should correctly transform response for ${name}`, () => {
                const result = responseTransformer(fixture.response, fixture.task, true)
                expect(result).toEqual(fixture.expected)
            })
        }
    )
})
