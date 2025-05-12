import { type ContextItem, type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'
import { ProcessType } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import * as uuid from 'uuid'

export class ProcessManager {
    // Using a Map for O(1) lookups by ID
    private processMap = new Map<string, ProcessingStep>()

    constructor(
        private readonly onChange: (steps: ProcessingStep[]) => void,
        private readonly onRequest: (step: ProcessingStep) => Promise<boolean>
    ) {}

    public addStep(_step: Partial<ProcessingStep>): ProcessingStep {
        const step: ProcessingStep = {
            ..._step,
            id: _step.id ?? uuid.v4(),
            type: _step.type || ProcessType.Step,
            state: 'pending',
            title: _step.title || undefined,
            content: _step.content || '',
            icon: _step.icon || undefined,
        }
        this.processMap.set(step.id, step)
        this.notifyChange()
        return step
    }

    public updateStep(id: string, updated: Partial<ProcessingStep>): ProcessingStep {
        const step = this.processMap.get(id)
        const process: ProcessingStep = {
            ...step,
            ...updated,
            id: step?.id ?? uuid.v4(),
            type: updated.type || ProcessType.Step,
            state: step?.state || updated?.state || 'pending',
            title: updated.title || undefined,
            content: updated.content || '',
            icon: updated.icon || undefined,
        }
        this.processMap.set(id, process)
        this.notifyChange()
        return process
    }

    public async addConfirmationStep(id: string, _step: Partial<ProcessingStep>): Promise<boolean> {
        const step = this.addStep({ ..._step, id, type: ProcessType.Confirmation })
        return this.onRequest(step)
    }

    public completeStep(id?: string, error?: Error, contextItems?: ContextItem[]): void {
        if (id) {
            const step = this.processMap.get(id)
            if (step) {
                this.processMap.set(id, {
                    ...step,
                    state: error ? 'error' : 'success',
                    ...(error && { error: errorToChatError(error) }),
                    ...(contextItems?.length && { context: contextItems }),
                })
            }
        } else {
            // Complete all pending processes
            for (const [id, step] of this.processMap) {
                if (step.state !== 'error') {
                    this.processMap.set(id, { ...step, state: 'success' })
                }
            }
        }
        this.notifyChange()
    }

    private notifyChange(): void {
        // Convert Map back to array in original order
        const processes = Array.from(this.processMap.values())
        this.onChange(processes)
    }
}
