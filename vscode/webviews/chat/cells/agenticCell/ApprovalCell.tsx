import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { TriangleAlertIcon } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Button } from '../../../components/shadcn/ui/button'
import type { VSCodeWrapper } from '../../../utils/VSCodeApi'

const CONFIRMATION_TITLES: Record<string, string> = {
    Terminal: 'Run command to retrieve context?',
}

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
        <div className="tw-mt-2 tw-w-full tw-justify-center">
            {Array.from(actions.values()).map(a => (
                <div
                    key={`confirmation-cell-${a.id}`}
                    className="tw-w-full tw-justify-center tw-min-w-xs tw-my-2 tw-p-2 tw-text-input-foreground tw-bg-input-background tw-rounded-lg tw-shadow tw-border tw-border-border"
                    role="alert"
                >
                    <div className="tw-p-4 tw-text-sm tw-font-normal tw-w-full tw-flex tw-flex-col tw-gap-2">
                        <span className="tw-flex tw-mb-2 tw-font-semibold tw-text-sm tw-text-foreground tw-gap-2 tw-items-center">
                            <TriangleAlertIcon size={16} />{' '}
                            {a.title ? CONFIRMATION_TITLES[a.title] ?? a.title : 'Action Required'}
                        </span>
                        <div className="tw-my-4 tw-text-xs tw-font-normal tw-bg-[var(--code-background)] tw-px-4 tw-py-2 tw-rounded-sm tw-border tw-border-border tw-font-mono">
                            {a.content}
                        </div>
                        <div className="tw-gap-2 tw-w-full tw-inline-flex tw-justify-end">
                            <Button
                                variant="outline"
                                className="tw-w-1/4"
                                onClick={() => handleClick(a.id, false)}
                            >
                                Reject
                            </Button>
                            <Button
                                variant="default"
                                className="tw-w-1/4"
                                onClick={() => handleClick(a.id, true)}
                            >
                                Allow
                            </Button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default ApprovalCell
