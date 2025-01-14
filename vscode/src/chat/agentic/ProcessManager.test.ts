import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { describe, expect, it, vi } from 'vitest'
import { ProcessManager } from './ProcessManager'

describe('ProcessManager', () => {
    // Helper to create manager instance with mock callback
    const createManager = () => {
        const onChange = vi.fn()
        const onRequest = vi.fn().mockResolvedValue(true)
        const manager = new ProcessManager(onChange, onRequest)
        return { manager, onChange }
    }

    describe('initializeStep', () => {
        it('creates initial pending step', () => {
            const { onChange } = createManager()

            expect(onChange.mock.lastCall).not.toBeDefined()
        })
    })

    describe('addStep', () => {
        it('adds new step with correct properties', () => {
            const { manager, onChange } = createManager()

            manager.addStep({ id: 'test-tool', content: 'test content' })

            expect(onChange).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        content: 'test content',
                        id: 'test-tool',
                        status: 'pending',
                    }),
                ])
            )
        })

        it('maintains step order', () => {
            const { manager, onChange } = createManager()

            manager.addStep({ id: 'tool1', content: 'content1' })
            manager.addStep({ id: 'tool2', content: 'content2' })

            const lastCall = onChange.mock.lastCall?.[0]
            expect(lastCall).toHaveLength(2)
            expect(lastCall[0].id).toBe('tool1')
            expect(lastCall[1].id).toBe('tool2')
        })
    })

    describe('completeStep', () => {
        it('completes specific tool step with success', () => {
            const { manager, onChange } = createManager()
            manager.addStep({ id: 'test-tool', content: 'content' })

            manager.completeStep('test-tool')

            const steps = onChange.mock.lastCall?.[0]
            const toolStep = steps.find((s: ProcessingStep) => s.id === 'test-tool')
            expect(toolStep?.status).toBe('success')
        })

        it('marks step as error when error provided', () => {
            const { manager, onChange } = createManager()
            manager.addStep({ id: 'test-tool', content: 'content' })

            const testError = new Error('test error')
            manager.completeStep('test-tool', testError)

            const steps = onChange.mock.lastCall?.[0]
            const toolStep = steps.find((s: ProcessingStep) => s.id === 'test-tool')
            expect(toolStep?.status).toBe('error')
            expect(toolStep?.error).toBeDefined()
        })

        it('completes all pending steps when no tool specified', () => {
            const { manager, onChange } = createManager()
            manager.addStep({ id: 'tool1', content: 'content1' })
            manager.addStep({ id: 'tool2', content: 'content2' })

            manager.completeStep()

            const steps = onChange.mock.lastCall?.[0]
            expect(steps.every((s: ProcessingStep) => s.status === 'success')).toBe(true)
        })

        it('preserves error status when completing all steps', () => {
            const { manager, onChange } = createManager()
            manager.addStep({ id: 'tool1', content: 'content1' })
            manager.completeStep('tool1', new Error('test error'))

            manager.completeStep()

            const steps = onChange.mock.lastCall?.[0]
            const errorStep = steps.find((s: ProcessingStep) => s.id === 'tool1')
            expect(errorStep?.status).toBe('error')
        })
    })

    describe('addConfirmationStep', () => {
        it('adds confirmation step with correct properties', () => {
            const { manager, onChange } = createManager()

            manager.addConfirmationStep('confirm-1', {
                content: 'confirmation content',
                title: 'Confirm Title',
            })

            expect(onChange).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        content: 'confirmation content',
                        id: 'confirm-1',
                        title: 'Confirm Title',
                        status: 'pending',
                        type: 'confirmation',
                    }),
                ])
            )
        })

        it('returns promise that resolves to onRequest result', async () => {
            const { manager } = createManager()

            const result = await manager.addConfirmationStep('confirm-1', {
                content: 'content',
                title: 'Title',
            })

            expect(result).toBe(true) // Since mock onRequest returns true
        })

        it('maintains correct step ordering with other steps', () => {
            const { manager, onChange } = createManager()
            manager.addStep({ id: 'tool1', content: 'content1' })
            manager.addConfirmationStep('confirm-1', { content: 'confirm content', title: 'Title' })

            const lastCall = onChange.mock.lastCall?.[0]
            expect(lastCall).toHaveLength(2)
            expect(lastCall[0].id).toBe('tool1')
            expect(lastCall[1].id).toBe('confirm-1')
            expect(lastCall[1].type).toBe('confirmation')
        })
    })
})
