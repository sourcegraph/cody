import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { InfoIcon } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Button } from '../../../components/shadcn/ui/button'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'

const ApprovalCell: FC = () => {
    const vscodeAPI = getVSCodeAPI()
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
        <div className="tw-mt-2">
            {Array.from(actions.values()).map(a => (
                <div
                    key={`confirmation-cell-${a.id}`}
                    className="tw-w-full tw-min-w-xs tw-my-2 tw-p-4 tw-text-gray-500 tw-bg-white tw-rounded-lg tw-shadow dark:tw-bg-gray-800 dark:tw-text-gray-400"
                    role="alert"
                >
                    <div className="tw-flex">
                        <div className="tw-inline-flex tw-pt-1 tw-items-center tw-justify-center tw-flex-shrink-0 tw-w-8 tw-h-8 tw-text-blue-500 tw-bg-blue-100 tw-rounded-lg dark:tw-text-blue-300 dark:tw-bg-blue-900">
                            <InfoIcon size={14} />
                        </div>
                        <div className="tw-ms-3 tw-text-sm tw-font-normal tw-w-full">
                            <span className="tw-mb-1 tw-font-semibold ">{a.title}</span>
                            <div className="tw-ml-2 tw-my-4 tw-text-sm tw-text-foreground">
                                {a.content}
                            </div>
                            <div className="tw-grid tw-grid-cols-2 tw-gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => handleClick(a.id, false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="button" onClick={() => handleClick(a.id, true)}>
                                    Confirm
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
