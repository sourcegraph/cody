import React from 'react'
import ReactDOM from 'react-dom/client'

import '../index.css'
import { AppWrapper } from '../AppWrapper'
import { WorkflowApp } from './WorkflowApp'
import { getVSCodeAPI } from '../utils/VSCodeApi'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <WorkflowApp vscodeAPI={getVSCodeAPI()}/>
        </AppWrapper>
    </React.StrictMode>
)