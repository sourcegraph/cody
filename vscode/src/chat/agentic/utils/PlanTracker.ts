import { type ProcessingStep, errorToChatError } from '@sourcegraph/cody-shared'

export class PlanTracker {
    private currentStepIndex = 0

    private static currentTracker: PlanTracker | null = null

    public static start(plan: ProcessingStep): PlanTracker {
        if (PlanTracker.currentTracker && !PlanTracker.currentTracker.isCompleted) {
            throw new Error('A plan tracker is already running')
        }
        if (PlanTracker.currentTracker?.isCompleted) {
            PlanTracker.currentTracker = null
        }
        return new PlanTracker(plan)
    }

    public static getTracker(): PlanTracker {
        if (!PlanTracker.currentTracker) {
            throw new Error('No plan tracker is currently running')
        }
        return PlanTracker.currentTracker
    }

    constructor(private plan: ProcessingStep) {
        // Initialize the plan with ordered steps if not already present
        plan.state = 'pending'
        if (this.plan.subSteps) {
            this.plan.subSteps = this.plan.subSteps.map((step, index) => ({
                ...step,
                step: index + 1,
            }))
        }
    }

    public getPlan(): ProcessingStep {
        return this.plan
    }

    public getCurrentStep(): ProcessingStep | null {
        return this.plan.subSteps?.[this.currentStepIndex] || null
    }

    public getLastStep(): ProcessingStep | null {
        if (this.currentStepIndex === 0) return null
        return this.plan.subSteps?.[this.currentStepIndex - 1] || null
    }

    public getNextStep(): ProcessingStep | null {
        if (!this.plan.subSteps || this.currentStepIndex >= this.plan.subSteps.length - 1) return null
        return this.plan.subSteps[this.currentStepIndex + 1]
    }

    public getCurrentStatus(): {
        lastStep: ProcessingStep | null
        currentStep: ProcessingStep | null
        nextStep: ProcessingStep | null
        isCompleted: boolean
    } {
        return {
            lastStep: this.getLastStep(),
            currentStep: this.getCurrentStep(),
            nextStep: this.getNextStep(),
            isCompleted: this.isCompleted,
        }
    }

    public advanceStep(): void {
        if (this.plan.subSteps && this.currentStepIndex < this.plan.subSteps.length - 1) {
            this.currentStepIndex++
        }
        // If all steps are completed, mark the plan as successful
        if (this.isCompleted) {
            this.plan.state = 'success'
        }
    }

    public updateStepStatus(status: 'pending' | 'success' | 'error', error?: Error): void {
        const currentStep = this.getCurrentStep()
        if (currentStep) {
            currentStep.state = status
            if (error) {
                currentStep.error = errorToChatError(error)
            }
        }
        // Advance to the next step if the current step is successful
        // if (status !== 'pending') {
        //     this.advanceStep()
        // }
    }

    public get isCompleted(): boolean {
        const hasPendingStep = this.plan.subSteps?.find(step => step.state === 'pending')
        return this.plan.state === 'success' || !hasPendingStep
    }

    private getMasterPrompt(): string {
        return `${this.plan.title!}: ${this.plan.description!}`
    }

    public getStatusPrompt(): string {
        const status = this.getCurrentStatus()
        if (!status.currentStep || status.isCompleted) {
            return 'All steps completed'
        }
        const prompts = [`TASK: Complete all the steps for ${this.getMasterPrompt()}\n`]
        if (status.lastStep) {
            prompts.push(`LAST STEP: ${status.lastStep.title} - ${status.lastStep.description}`)
        }
        prompts.push(`CURRENT STEP: ${status.currentStep.title} - ${status.currentStep.description}
        SUGGESTION: ${status.currentStep.subSteps?.map(s => `${s.title}(${s.content})`).join(', ')}
        IMPORTANT: Suggested actions should only be used as reference. You should review the context and determine the best course of action.`)
        if (status.nextStep) {
            prompts.push(`NEXT STEP: ${status.nextStep.title} - ${status.nextStep.description}`)
        }
        return prompts.join('\n')
    }
}
