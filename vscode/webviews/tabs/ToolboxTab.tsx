import type { FC } from 'react'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { View } from './types'

interface ToolboxTabProps {
    setView: (view: View) => void
}

const ToolboxTab: FC<ToolboxTabProps> = ({ setView }) => {
    return (
        <div className="tw-p-4 tw-h-full tw-overflow-auto">
            <div className="tw-mb-6">
                <h2 className="tw-text-xl tw-font-semibold tw-text-center">Cody Toolbox</h2>
            </div>

            <div className="tw-p-2 tw-space-y-2">
                <Button
                    type="button"
                    className="tw-w-full"
                    variant="secondary"
                    onClick={() => {
                        getVSCodeAPI().postMessage({
                            command: 'command',
                            id: 'cody.openWorkflowEditor',
                        })
                    }}
                >
                    Workflow Editor
                </Button>
            </div>
        </div>
    )
}

export default ToolboxTab
