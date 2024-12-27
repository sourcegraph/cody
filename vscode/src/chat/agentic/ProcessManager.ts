import { type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'

export class ProcessManager {
    private processes: ProcessingStep[] = []

    constructor(private readonly onChange: (processes: ProcessingStep[]) => void) {}

    public initializeStep(): void {
        this.processes = [
            {
                content: '',
                id: '',
                step: 0,
                status: 'pending',
            },
        ]
        this.notifyChange()
    }

    public addStep(toolName: string, content: string): void {
        this.processes.push({
            content,
            id: toolName,
            step: this.processes.length,
            status: 'pending',
        })
        this.notifyChange()
    }

    public completeStep(toolName?: string, error?: Error): void {
        if (toolName) {
            // Update specific tool
            this.processes = this.processes.map(step =>
                step.id === toolName
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
