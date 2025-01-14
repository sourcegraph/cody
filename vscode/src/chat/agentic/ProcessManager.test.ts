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
            const { manager, onChange } = createManager()

            manager.initializeStep()

            expect(onChange).toHaveBeenCalledWith([
                {
                    content: '',
                    id: '',
                    step: 0,
                    status: 'pending',
                    type: 'step',
                },
            ])
        })
    })

    describe('addStep', () => {
        it('adds new step with correct properties', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()

            manager.addStep('test-tool', 'test content')

            expect(onChange).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        content: 'test content',
                        id: 'test-tool',
                        step: 1,
                        status: 'pending',
                        type: 'step',
                    }),
                ])
            )
        })

        it('maintains step order', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()

            manager.addStep('tool1', 'content1')
            manager.addStep('tool2', 'content2')

            const lastCall = onChange.mock.lastCall?.[0]
            expect(lastCall).toHaveLength(3)
            expect(lastCall[1].id).toBe('tool1')
            expect(lastCall[2].id).toBe('tool2')
        })
    })

    describe('completeStep', () => {
        it('completes specific tool step with success', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()
            manager.addStep('test-tool', 'content')

            manager.completeStep('test-tool')

            const steps = onChange.mock.lastCall?.[0]
            const toolStep = steps.find((s: ProcessingStep) => s.id === 'test-tool')
            expect(toolStep?.status).toBe('success')
        })

        it('marks step as error when error provided', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()
            manager.addStep('test-tool', 'content')

            const testError = new Error('test error')
            manager.completeStep('test-tool', testError)

            const steps = onChange.mock.lastCall?.[0]
            const toolStep = steps.find((s: ProcessingStep) => s.id === 'test-tool')
            expect(toolStep?.status).toBe('error')
            expect(toolStep?.error).toBeDefined()
        })

        it('completes all pending steps when no tool specified', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()
            manager.addStep('tool1', 'content1')
            manager.addStep('tool2', 'content2')

            manager.completeStep()

            const steps = onChange.mock.lastCall?.[0]
            expect(steps.every((s: ProcessingStep) => s.status === 'success')).toBe(true)
        })

        it('preserves error status when completing all steps', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()
            manager.addStep('tool1', 'content1')
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
            manager.initializeStep()

            manager.addConfirmationStep('confirm-1', 'Confirm Title', 'confirmation content')

            expect(onChange).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        content: 'confirmation content',
                        id: 'confirm-1',
                        title: 'Confirm Title',
                        step: 1,
                        status: 'pending',
                        type: 'confirmation',
                    }),
                ])
            )
        })

        it('returns promise that resolves to onRequest result', async () => {
            const { manager } = createManager()
            manager.initializeStep()

            const result = await manager.addConfirmationStep('confirm-1', 'Title', 'content')

            expect(result).toBe(true) // Since mock onRequest returns true
        })

        it('maintains correct step ordering with other steps', () => {
            const { manager, onChange } = createManager()
            manager.initializeStep()
            manager.addStep('tool1', 'content1')
            manager.addConfirmationStep('confirm-1', 'Title', 'confirm content')

            const lastCall = onChange.mock.lastCall?.[0]
            expect(lastCall).toHaveLength(3)
            expect(lastCall[1].id).toBe('tool1')
            expect(lastCall[2].id).toBe('confirm-1')
            expect(lastCall[2].type).toBe('confirmation')
        })
    })
})
