import { ReactFlowProvider } from '@xyflow/react'
import type React from 'react'
import '../index.css'
import type { VSCodeWrapper } from '../utils/VSCodeApi'
import { Flow } from './components/Flow'

export const WorkflowApp: React.FC<{ vscodeAPI: VSCodeWrapper }> = vscodeAPI => {
    return (
        <ReactFlowProvider>
            <Flow {...vscodeAPI} />
        </ReactFlowProvider>
    )
}
