import React from 'react'
import ReactDOM from 'react-dom/client'

import '../index.css'
import { ReactFlowProvider } from '@xyflow/react'
import { AppWrapper } from '../AppWrapper'
import { getGenericVSCodeAPI } from '../utils/VSCodeApi'
import { WorkflowApp } from './WorkflowApp'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <ReactFlowProvider>
                <WorkflowApp vscodeAPI={getGenericVSCodeAPI()} />
            </ReactFlowProvider>
        </AppWrapper>
    </React.StrictMode>
)
