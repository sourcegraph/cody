import React from 'react'
import ReactDOM from 'react-dom/client'

import '../index.css'
import { AppWrapper } from '../AppWrapper'
import { WorkflowApp } from './WorkflowApp'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <WorkflowApp />
        </AppWrapper>
    </React.StrictMode>
)