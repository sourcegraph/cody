import React from 'react'

import ReactDOM from 'react-dom/client'

import './index.css'

import { GuidePanel } from './GuidePanel'
import { getVSCodeAPI } from './utils/VSCodeApi'

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
    <React.StrictMode>
        <GuidePanel vscodeAPI={getVSCodeAPI()} />
    </React.StrictMode>
)
