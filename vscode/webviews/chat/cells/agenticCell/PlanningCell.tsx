import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { Check, NotebookPenIcon } from 'lucide-react'
import type React from 'react'
import { Button } from '../../../components/shadcn/ui/button'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'

interface PlanningCellProps {
    vscodeAPI: VSCodeWrapper
    processes: ProcessingStep[]
}

export const PlanningCell: React.FC<PlanningCellProps> = ({ processes, vscodeAPI }) => {
    const plan = processes.find(p => p.type === 'plan')
    const steps = plan?.subSteps || []
    const firstPendingStep = steps.findIndex(step => step.state === 'pending')

    if (!plan || !steps) {
        return null
    }

    return (
        <div className="tw-py-2 tw-px-4 tw-w-full">
            <div className="tw-mx-auto tw-w-full tw-p-4 tw-px-8 tw-my-4 tw-border tw-border-muted tw-rounded-lg tw-shadow-lg">
                <h1 className="tw-text-md tw-font-semibold">
                    <NotebookPenIcon className="tw-inline-block tw-mr-4" size={14} />
                    {plan.title}
                </h1>
                <p className="tw-my-2 tw-font-xs tw-text-muted-foreground">{plan.content}</p>
                <ol className="tw-relative tw-text-gray-500 tw-border-s tw-border-gray-200 dark:tw-border-muted-foreground tw-ml-5 tw-my-8">
                    {steps.map((step, index) => (
                        <li key={step.id} className="tw-mb-10 tw-ms-6">
                            <span className="tw-absolute tw-flex tw-items-center tw-justify-center tw-w-10 tw-h-10 tw-bg-gray-100 tw-rounded-full tw--start-5 tw-ring-5 tw-ring-white dark:tw-ring-transparent dark:tw-bg-gray-700">
                                {step.state === 'success' ? (
                                    <span className="tw-text-sm tw-font-medium">
                                        <Check className="tw-w-3.5 tw-h-3.5 tw-text-green-500 dark:tw-text-green-400" />
                                    </span>
                                ) : (
                                    <span className="tw-text-foreground tw-text-sm tw-font-medium">
                                        {index + 1}
                                    </span>
                                )}
                            </span>
                            <div className="tw-ml-5">
                                <h3 className="tw-font-sm tw-leading-tight tw-mb-2">{step.title}</h3>
                                <p className="tw-font-xs tw-text-muted-foreground">{step.content}</p>
                                {!!step.subSteps?.length && (
                                    <p className="tw-font-xs tw-text-muted-foreground">
                                        Tools: {step.subSteps.map(s => s.title)?.join(', ')}
                                    </p>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
                {firstPendingStep >= 0 && (
                    <footer className="tw-container tw-flex tw-w-full tw-justify-end ">
                        <div className="tw-flex tw-gap-4">
                            {/* TODO: Attach plan as context for next chat */}
                            <Button variant="outline" onClick={() => {}}>
                                Edit
                            </Button>
                            {/* TODO: Run plan on start */}

                            <Button
                                onClick={() =>
                                    vscodeAPI.postMessage({
                                        command: 'action/confirmation',
                                        id: plan.id,
                                        response: true,
                                    })
                                }
                            >
                                Start
                            </Button>
                        </div>
                    </footer>
                )}
            </div>
        </div>
    )
}
