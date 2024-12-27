import { type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'

export class ProcessManager {
    private steps: ProcessingStep[] = []

    constructor(private readonly onChange: (steps: ProcessingStep[]) => void) {}

    public initializeStep(): void {
        this.steps = [
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
        this.steps.push({
            content,
            id: toolName,
            step: this.steps.length,
            status: 'pending',
        })
        this.notifyChange()
    }

    public completeStep(toolName?: string, error?: Error): void {
        if (toolName) {
            // Update specific tool
            this.steps = this.steps.map(step =>
                step.id === toolName
                    ? {
                          ...step,
                          status: error ? 'error' : 'success',
                          ...(error && { error: errorToChatError(error) }),
                      }
                    : step
            )
        } else {
            // Complete all pending steps
            this.steps = this.steps.map(step => ({
                ...step,
                status: step.status === 'error' ? step.status : 'success',
            }))
        }
        this.notifyChange()
    }

    private notifyChange(): void {
        this.onChange(this.steps)
    }
}
