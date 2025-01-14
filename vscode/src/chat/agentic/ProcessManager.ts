import { type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'
import { ProcessType } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import * as uuid from 'uuid'

export class ProcessManager {
    // Using a Map for O(1) lookups by ID
    private processMap = new Map<string, ProcessingStep>()

    constructor(
        private readonly onChange: (processes: ProcessingStep[]) => void,
        private readonly onRequest: (step: ProcessingStep) => Promise<boolean>
    ) {}

    public addStep(_step: Partial<ProcessingStep>): ProcessingStep {
        const step: ProcessingStep = {
            ..._step,
            id: _step.id ?? uuid.v4(),
            type: _step.type,
            status: 'pending',
            title: _step.title || undefined,
            content: _step.content || '',
        }
        this.processMap.set(step.id, step)
        this.notifyChange()
        return step
    }

    public async addConfirmationStep(id: string, _step: Partial<ProcessingStep>): Promise<boolean> {
        const step = this.addStep({ ..._step, id, type: ProcessType.Confirmation })
        return this.onRequest(step)
    }

    public updateStep(id: string, content: string): void {
        const step = this.processMap.get(id)
        if (!step) {
            return
        }
        this.processMap.set(id, { ...step, content })
        this.notifyChange()
    }

    public completeStep(id?: string, error?: Error): void {
        if (id) {
            const step = this.processMap.get(id)
            if (step) {
                this.processMap.set(id, {
                    ...step,
                    status: error ? 'error' : 'success',
                    ...(error && { error: errorToChatError(error) }),
                })
            }
        } else {
            // Complete all pending processes
            for (const [id, step] of this.processMap) {
                if (step.status !== 'error') {
                    this.processMap.set(id, { ...step, status: 'success' })
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
