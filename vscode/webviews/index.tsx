import React from 'react'

import ReactDOM from 'react-dom/client'

import { App } from './App'

import './index.css'
import { AppWrapper } from './AppWrapper'
import { getVSCodeAPI } from './utils/VSCodeApi'

const vscodeAPI = getVSCodeAPI()

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <AppWrapper vscodeAPI={vscodeAPI}>
            <App vscodeAPI={vscodeAPI} />
        </AppWrapper>
    </React.StrictMode>
)
