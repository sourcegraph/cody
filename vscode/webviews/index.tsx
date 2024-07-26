import React from 'react'

import ReactDOM from 'react-dom/client'

import { App } from './App'

import './index.css'
import { AppWrapper } from './AppWrapper'
import { getVSCodeAPI } from './utils/VSCodeApi'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper>
            <App vscodeAPI={getVSCodeAPI()} />
        </AppWrapper>
    </React.StrictMode>
)
