import { Command } from 'commander'
import { describe, expect, it } from 'vitest'

// Create a minimal test command that mimics the structure of benchCommand
function createTestBenchCommand() {
    return new Command('bench')
        .description('Test bench command')
        .option(
            '--judge-model <model>',
            'The model to use for LLM judging (e.g., anthropic/claude-3-5-sonnet-20240620, anthropic/claude-3-haiku, etc.)',
            'anthropic/claude-3-5-sonnet-20240620'
        )
        .option('--workspace <path>', 'The workspace directory', process.cwd())
        .option('--test-count <number>', 'Number of tests', val => Number.parseInt(val, 10), 100)
}

describe('CLI judge-model option parsing', () => {
    it('should use default judge-model when not specified', async () => {
        const command = createTestBenchCommand()
        const args = ['--workspace', '/test']

        await command.parseAsync(args, { from: 'user' })
        const options = command.opts()

        expect(options.judgeModel).toBe('anthropic/claude-3-5-sonnet-20240620')
    })

    it('should accept custom judge-model when specified', async () => {
        const command = createTestBenchCommand()
        const customModel = 'anthropic/claude-3-haiku-20240307'
        const args = ['--judge-model', customModel, '--workspace', '/test']

        await command.parseAsync(args, { from: 'user' })
        const options = command.opts()

        expect(options.judgeModel).toBe(customModel)
    })

    it('should handle various model name formats', async () => {
        const testCases = [
            'anthropic/claude-3-5-sonnet-20240620',
            'anthropic/claude-3-haiku',
            'anthropic/claude-3-opus',
            'openai/gpt-4',
            'openai/gpt-3.5-turbo',
            'custom-model',
            'provider/model-name-with-dashes',
            'simple-name',
        ]

        for (const model of testCases) {
            const command = createTestBenchCommand()
            const args = ['--judge-model', model, '--workspace', '/test']

            await command.parseAsync(args, { from: 'user' })
            const options = command.opts()

            expect(options.judgeModel).toBe(model)
        }
    })

    it('should work with judge-model in different argument positions', async () => {
        const model = 'test-model'
        const testArgsVariations = [
            // judge-model first
            ['--judge-model', model, '--workspace', '/test', '--test-count', '50'],
            // judge-model in middle
            ['--workspace', '/test', '--judge-model', model, '--test-count', '50'],
            // judge-model last
            ['--workspace', '/test', '--test-count', '50', '--judge-model', model],
        ]

        for (const args of testArgsVariations) {
            const command = createTestBenchCommand()
            await command.parseAsync(args, { from: 'user' })
            const options = command.opts()

            expect(options.judgeModel).toBe(model)
        }
    })

    it('should handle equals syntax for judge-model', async () => {
        const command = createTestBenchCommand()
        const model = 'anthropic/claude-3-haiku'
        const args = [`--judge-model=${model}`, '--workspace', '/test']

        await command.parseAsync(args, { from: 'user' })
        const options = command.opts()

        expect(options.judgeModel).toBe(model)
    })

    it('should preserve other options when judge-model is specified', async () => {
        const command = createTestBenchCommand()
        const args = [
            '--judge-model',
            'custom-model',
            '--workspace',
            '/custom/workspace',
            '--test-count',
            '200',
        ]

        await command.parseAsync(args, { from: 'user' })
        const options = command.opts()

        expect(options.judgeModel).toBe('custom-model')
        expect(options.workspace).toBe('/custom/workspace')
        expect(options.testCount).toBe(200)
    })
})

describe('CLI option validation', () => {
    it('should accept models with complex naming patterns', async () => {
        const complexModels = [
            'anthropic/claude-3-5-sonnet-20240620',
            'openai/gpt-4-turbo-2024-04-09',
            'provider/model-v1.2.3-beta',
            'custom_provider/model_name_with_underscores',
            'simple',
        ]

        for (const model of complexModels) {
            const command = createTestBenchCommand()
            const args = ['--judge-model', model, '--workspace', '/test']

            // Should not throw
            await expect(command.parseAsync(args, { from: 'user' })).resolves.not.toThrow()

            const options = command.opts()
            expect(options.judgeModel).toBe(model)
        }
    })

    it('should handle empty string model name', async () => {
        const command = createTestBenchCommand()
        const args = ['--judge-model', '', '--workspace', '/test']

        await command.parseAsync(args, { from: 'user' })
        const options = command.opts()

        expect(options.judgeModel).toBe('')
    })
})
