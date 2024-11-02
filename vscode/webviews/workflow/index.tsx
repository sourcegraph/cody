import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppWrapper } from '../AppWrapper'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface WorkflowEditorProps {
    vscodeAPI: ReturnType<typeof getVSCodeAPI>
}

const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ vscodeAPI }) => {
    return (
        <div className="tw-p-4">
            <h1 className="tw-text-xl tw-font-semibold tw-mb-4">Workflow Editor</h1>
            {/* Add workflow editor specific components here */}
        </div>
    )
}

// Initialize the React app
ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <WorkflowEditor vscodeAPI={getVSCodeAPI()} />
        </AppWrapper>
    </React.StrictMode>
)
