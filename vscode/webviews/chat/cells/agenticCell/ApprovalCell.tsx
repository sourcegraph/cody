import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { type FC, useEffect, useState } from 'react'
import { Button } from '../../../components/shadcn/ui/button'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'

const ApprovalCell: FC<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [actions, setActions] = useState<Map<string, ProcessingStep>>(new Map())

    const handleClick = (id: string, response: boolean) => {
        // Handle the confirmation action here
        vscodeAPI.postMessage({ command: 'action/confirmation', id, response })

        setActions(prev => {
            const newActions = new Map(prev)
            newActions.delete(id)
            return newActions
        })
    }

    useEffect(
        () =>
            vscodeAPI.onMessage(message => {
                if (message.type === 'action/confirmationRequest' && message.step) {
                    const step = message.step as ProcessingStep
                    if (step.type === 'confirmation') {
                        setActions(prev => new Map(prev.set(message.id, step)))
                    }
                }
            }),
        [vscodeAPI]
    )

    if (actions.size === 0) {
        return null
    }

    return (
        <div className="tw-mt-2 tw-w-full">
            {Array.from(actions.values()).map(a => (
                <div
                    key={`confirmation-cell-${a.id}`}
                    className="tw-w-full tw-min-w-xs tw-max-w-[600px] tw-my-2 tw-p-4 tw-bg-muted-transparent tw-text-muted-foreground tw-rounded-lg tw-shadow tw-border tw-border-border"
                    role="alert"
                >
                    <div className="tw-flex">
                        <div className="tw-ms-3 tw-text-sm tw-font-normal tw-w-full">
                            <span className="tw-mb-1 tw-font-bold tw-text-md tw-text-foreground">
                                ⓘ {a.title ?? 'Pending Approval'}
                            </span>
                            <div className="tw-ml-2 tw-my-4 tw-text-sm tw-text-muted-foreground">
                                {a.content}
                            </div>
                            <div className="tw-grid tw-grid-cols-2 tw-gap-2">
                                <Button
                                    variant="danger"
                                    onClick={() => handleClick(a.id, false)}
                                    className="tw-opacity-85"
                                >
                                    Reject
                                </Button>
                                <Button variant="success" onClick={() => handleClick(a.id, true)}>
                                    Accept
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default ApprovalCell
