import { describe, expect, it } from 'vitest'
import { SMART_APPLY_CUSTOM_PROMPT_TOPICS, SMART_APPLY_MODEL_IDENTIFIERS } from '../prompt/constants'
import { responseTransformer } from './response-transformer'
import { RESPONSE_TEST_FIXTURES } from './test-fixtures'

// Since extractSmartApplyCustomModelResponse is not exported, we'll need to test it through the responseTransformer
describe('Smart Apply Response Extraction', () => {
    const createTask = (intent: string, model: string) =>
        ({
            ...RESPONSE_TEST_FIXTURES.clean.task,
            intent,
            model,
        }) as any

    it('should extract code between smart apply tags for valid input', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>const x = 1;</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        // When isMessageInProgress is true, the original text is returned without processing
        const resultInProgress = responseTransformer(text, task, true)
        expect(resultInProgress).toBe(text)

        // When isMessageInProgress is false, the text is processed
        const result = responseTransformer(text, task, false)
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

        // When isMessageInProgress is true, the original text is returned without processing
        const resultInProgress = responseTransformer(text, task, true)
        expect(resultInProgress).toBe(text)

        // When isMessageInProgress is false, the text is processed
        const result = responseTransformer(text, task, false)
        expect(result).toBe(
            `outer <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>inner</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> content`
        )
    })

    it('should handle empty content between tags', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
        const task = createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault)

        // When isMessageInProgress is true, the original text is returned without processing
        const resultInProgress = responseTransformer(text, task, true)
        expect(resultInProgress).toBe(text)

        // When isMessageInProgress is false, the text is processed
        const result = responseTransformer(text, task, false)
        expect(result).toBe('')
    })

    it('should not add newline for smartApply with empty selection range', () => {
        const text = 'const x = 1;'
        const task = {
            ...createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault),
            mode: 'insert',
            selectionRange: { isEmpty: true },
            original: '',
            fixupFile: { uri: {} as any },
        } as any

        const result = responseTransformer(text, task, false)
        expect(result).toBe('const x = 1;')
        expect(result.endsWith('\n')).toBe(false)
    })

    it('should preserve newlines based on original text', () => {
        const text = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>\nconst x = 1;\n</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`

        // Test 1: Original has no newlines, result should have no newlines
        const task1 = {
            ...createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault),
            original: 'const y = 2;',
        } as any
        const result1 = responseTransformer(text, task1, false)
        expect(result1).toBe('const x = 1;')
        expect(result1.startsWith('\n')).toBe(false)
        expect(result1.endsWith('\n')).toBe(false)

        // Test 2: Original has starting newline, result should have starting newline
        const task2 = {
            ...createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault),
            original: '\nconst y = 2;',
        } as any
        const result2 = responseTransformer(text, task2, false)
        expect(result2).toBe('\nconst x = 1;')
        expect(result2.startsWith('\n')).toBe(true)
        expect(result2.endsWith('\n')).toBe(false)

        // Test 3: Original has ending newline, result should have ending newline
        const task3 = {
            ...createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault),
            original: 'const y = 2;\n',
        } as any
        const result3 = responseTransformer(text, task3, false)
        expect(result3).toBe('const x = 1;\n')
        expect(result3.startsWith('\n')).toBe(false)
        expect(result3.endsWith('\n')).toBe(true)

        // Test 4: Original has both newlines, result should have both newlines
        const task4 = {
            ...createTask('smartApply', SMART_APPLY_MODEL_IDENTIFIERS.FireworksQwenCodeDefault),
            original: '\nconst y = 2;\n',
        } as any
        const result4 = responseTransformer(text, task4, false)
        expect(result4).toBe('\nconst x = 1;\n')
        expect(result4.startsWith('\n')).toBe(true)
        expect(result4.endsWith('\n')).toBe(true)
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
