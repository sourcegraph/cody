import type Anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'
import type {
    MinionExtensionMessage,
    MinionWebviewMessage,
} from '../../webviews/minion/webview_protocol'
import type { PlanStatus, Step } from './action'
import { runStep } from './blocks/plan-run-step'
import type { Environment } from './environment'
import type { Memory } from './statemachine'

interface PlanControllerDelegate {
    postMessage(message: MinionExtensionMessage): Promise<boolean | undefined>
}

const enabledStepIds = ['update-changelog']

export class PlanController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private stepsStatus: {
        [stepid: string]: {
            status: PlanStatus
            cancelSource?: vscode.CancellationTokenSource
            acts: string[]
        }
    }
    constructor(
        private planBlockId: string,
        private steps: Step[],
        private memory: Memory,
        private env: Environment,
        private anthropic: Anthropic,
        private delegate: PlanControllerDelegate
    ) {
        this.stepsStatus = {}
        for (const step of steps) {
            this.stepsStatus[step.stepId] = {
                status: enabledStepIds.includes(step.stepId) ? 'todo' : 'run-disabled',
                acts: [],
            }
        }

        // TODO(beyang): move outside constructor
        this.delegate.postMessage({
            type: 'update-plan-step-status',
            blockid: planBlockId,
            stepStatus: this.stepsStatus,
        })
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    private updatePlanStepStatus(
        stepid: string,
        s: {
            status: PlanStatus
            cancelSource?: vscode.CancellationTokenSource
            acts: string[]
        }
    ): void {
        this.stepsStatus[stepid] = s
        this.delegate.postMessage({
            type: 'update-plan-step-status',
            blockid: this.planBlockId,
            stepStatus: this.stepsStatus,
        })
    }

    public handleDidReceiveMessage(message: MinionWebviewMessage): void {
        switch (message.type) {
            case 'update-plan-step': {
                this.handleUpdatePlanStep(message)
                break
            }
        }
    }

    private handleUpdatePlanStep({
        blockid,
        stepid,
        status,
    }: MinionWebviewMessage & { type: 'update-plan-step' }): void {
        if (blockid !== this.planBlockId) {
            return
        }
        const step = this.steps.find(step => step.stepId === stepid)
        if (!step) {
            return
        }
        const currentStepStatus = this.stepsStatus[stepid]
        if (currentStepStatus.status === status) {
            return
        }
        if (['todo', 'run-disabled'].includes(currentStepStatus.status) && status === 'done') {
            this.updatePlanStepStatus(stepid, { status, acts: [] })
            return
        }
        if (currentStepStatus.status === 'done' && ['todo', 'run-disabled'].includes(status)) {
            this.updatePlanStepStatus(stepid, { status, acts: [] })
            return
        }
        if (currentStepStatus.status === 'todo' && status === 'running') {
            const stepStatus = this.stepsStatus[stepid]
            if (stepStatus.status === 'todo') {
                const cancelSource = new vscode.CancellationTokenSource()
                this.disposables.push(cancelSource)
                this.updatePlanStepStatus(stepid, {
                    status,
                    cancelSource,
                    acts: [],
                })
                void runStep(cancelSource.token, step, this.env, this.memory, this.anthropic).then(
                    result => {
                        if (result.status === 'cancelled') {
                            this.updatePlanStepStatus(stepid, {
                                status: 'todo',
                                acts: [],
                            })
                        } else if (result.status === 'done') {
                            this.updatePlanStepStatus(stepid, {
                                status: 'done',
                                acts: [],
                            })
                        }
                    }
                )
            }
        } else if (currentStepStatus.status === 'running') {
            currentStepStatus.cancelSource?.cancel()
            this.updatePlanStepStatus(stepid, { status, acts: [] })
        }
    }
}
