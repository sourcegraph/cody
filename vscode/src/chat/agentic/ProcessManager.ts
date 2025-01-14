import { type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'
import { ProcessType } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

export class ProcessManager {
    private processes: ProcessingStep[] = []

    constructor(
        private readonly onChange: (processes: ProcessingStep[]) => void,
        private readonly onRequest: (step: ProcessingStep) => Promise<boolean>
    ) {}

    public initializeStep(): void {
        this.processes = [
            {
                content: '',
                id: '',
                step: 0,
                type: ProcessType.Step,
                status: 'pending',
            },
        ]
        this.notifyChange()
    }

    public addStep(toolName: string, content: string): void {
        this.processes.push({
            type: ProcessType.Step,
            content,
            id: toolName,
            step: this.processes.length,
            status: 'pending',
        })
        this.notifyChange()
    }

    public addConfirmationStep(stepId: string, title: string, content: string): Promise<boolean> {
        const step = {
            type: ProcessType.Confirmation,
            content,
            id: stepId,
            title,
            step: this.processes.length,
            status: 'pending',
        } satisfies ProcessingStep
        this.processes.push(step)
        this.notifyChange()
        return this.onRequest(step)
    }

    public completeStep(toolId?: string, error?: Error): void {
        if (toolId) {
            // Update specific tool
            this.processes = this.processes.map(step =>
                step.id === toolId
                    ? {
                          ...step,
                          status: error ? 'error' : 'success',
                          ...(error && { error: errorToChatError(error) }),
                      }
                    : step
            )
        } else {
            // Complete all pending processes
            this.processes = this.processes.map(step => ({
                ...step,
                status: step.status === 'error' ? step.status : 'success',
            }))
        }
        this.notifyChange()
    }

    private notifyChange(): void {
        this.onChange(this.processes)
    }
}
